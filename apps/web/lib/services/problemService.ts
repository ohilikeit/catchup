import 'server-only';
import { withTransaction } from '../db';
import * as problemsRepo from '../db/repositories/problems';
import type { RoleTrack } from '../db/repositories/problems';
import { putObject, getObjectBuffer, removeObject, removeByPrefix, sha256, sanitizeFilename, BUCKETS } from '../storage';
import {
  normalizeScaffoldArchive,
  normalizedScaffoldName,
  type NormalizeSummary,
} from '../storage/scaffoldNormalize';
import {
  listTgzEntries,
  readTgzEntry,
  isProbablyText,
  MAX_ARCHIVE_BYTES,
  MAX_PREVIEW_BYTES,
  type TgzEntry,
} from '../storage/tgzPreview';
import { parseSheets, type SheetData } from '../storage/sheetPreview';

// problemService — 문제 버전 업로드(admin). route/action은 얇게, 검증·트랜잭션·스토리지 적재는 여기서.
// ⭐ scaffold 해시는 서버 재산출(클라 입력 신뢰 금지, 대원칙 ⑤).

const ROLE_TRACKS: readonly RoleTrack[] = ['planning', 'dev', 'marketing'];
const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export interface UploadFilePart {
  filename: string;
  mime: string | null;
  bytes: Buffer;
}

/**
 * 문제 업로드: 문제 upsert → 다음 버전 → scaffold(필수) MinIO 적재 → 버전 INSERT.
 * 전부 한 트랜잭션(게이트→put→insert 순서, submitByod와 동형). 키가 결정적이라 재시도 안전.
 * scaffold ref는 `exam-scaffold/<code>/v<version>/<name>` 포인터로만 DB에 남는다(실체는 MinIO).
 */
export async function uploadProblemVersion(input: {
  code: string;
  roleTrack: string;
  title: string;
  scaffold: UploadFilePart;
}): Promise<{ code: string; version: number; normalize: NormalizeSummary }> {
  const code = input.code.trim();
  const title = input.title.trim();

  if (!CODE_RE.test(code)) {
    throw new Error('문제 코드는 영소문자·숫자·-·_ 로 2~64자여야 합니다(예: planning-a1).');
  }
  if (!ROLE_TRACKS.includes(input.roleTrack as RoleTrack)) {
    throw new Error('직무(role_track)는 planning · dev · marketing 중 하나여야 합니다.');
  }
  if (!title) {
    throw new Error('문제 제목을 입력하세요.');
  }
  if (!input.scaffold || input.scaffold.bytes.length === 0) {
    throw new Error('스캐폴드 파일을 선택하세요.');
  }
  const roleTrack = input.roleTrack as RoleTrack;

  // ⭐ 정규화: zip/tgz 어느 쪽이든 받아 쓰레기 제거·wrapping 평탄화 후 표준 tgz로 저장.
  //    seeder(tar -xzf)·미리보기는 tgz 단일 포맷만 본다. sha256은 저장 실체(정규화 tgz) 기준.
  const normalized = normalizeScaffoldArchive(input.scaffold.bytes);

  return withTransaction(async (client) => {
    await problemsRepo.upsertProblemTx(client, code, roleTrack, title);
    const version = await problemsRepo.nextVersionTx(client, code);

    const scaffoldName = normalizedScaffoldName(sanitizeFilename(input.scaffold.filename));
    await putObject(
      BUCKETS.scaffold,
      `${code}/v${version}/${scaffoldName}`,
      normalized.tgz,
      'application/gzip',
    );

    const saved = await problemsRepo.insertProblemVersionTx(client, {
      problemCode: code,
      version,
      publicScaffoldRef: `${BUCKETS.scaffold}/${code}/v${version}/${scaffoldName}`,
      scaffoldSha256: sha256(normalized.tgz),
    });

    return { code, version: saved.version, normalize: normalized.summary };
  });
}

/**
 * 저장된 스캐폴드 교체(덮어쓰기): 같은 버전의 객체·ref·sha256을 새 파일(zip/tgz, 정규화)로 갱신.
 * ⚠️ 버전은 원래 불변 스냅샷(0003 — 재현·공정성)이다. 교체는 "업로드 실수 교정" 운영 도구로,
 * 이미 응시가 진행된 회차의 재현성을 깰 수 있어 UI가 경고·확인을 거친다.
 * 이미 떠 있는 pod에는 영향 없음 — 다음 provision(시험 환경 열기)부터 새 scaffold가 시드된다.
 */
export async function overwriteScaffold(
  versionId: string,
  file: UploadFilePart,
): Promise<{ ref: string; sha256: string; normalize: NormalizeSummary }> {
  const version = await problemsRepo.findVersionById(versionId);
  if (!version) throw new Error('문제 버전을 찾을 수 없습니다.');
  if (!file || file.bytes.length === 0) throw new Error('교체할 파일을 선택하세요.');

  const normalized = normalizeScaffoldArchive(file.bytes);
  const name = normalizedScaffoldName(sanitizeFilename(file.filename));
  const key = `${version.problemCode}/v${version.version}/${name}`;
  const ref = `${BUCKETS.scaffold}/${key}`;
  const digest = sha256(normalized.tgz);

  await putObject(BUCKETS.scaffold, key, normalized.tgz, 'application/gzip');
  await problemsRepo.updateVersionScaffold(versionId, ref, digest);

  // 파일명이 바뀌어 키가 달라졌으면 이전 객체는 정리(best-effort — 실패해도 ref가 정보원).
  if (version.publicScaffoldRef !== ref && version.publicScaffoldRef.startsWith(`${BUCKETS.scaffold}/`)) {
    await removeObject(BUCKETS.scaffold, version.publicScaffoldRef.slice(BUCKETS.scaffold.length + 1)).catch(
      () => undefined,
    );
  }

  return { ref, sha256: digest, normalize: normalized.summary };
}

/* ── 문제 삭제/비활성화(관리자) — admin/problems 삭제 관리 ──────────────────
 * 정책: 회차에 쓰인 적 있으면 하드 삭제 금지(재현·이력 보존) → is_active 비활성화로만 내린다.
 * 미사용이면 버전·MinIO 객체까지 완전 삭제. (docs/6 Phase 1d, reference/02 RESTRICT 체인) */

export interface ProblemDeleteResult {
  ok: boolean;
  error?: string;
}

/** 문제 활성/비활성 토글(소프트). 비활성 문제는 새 회차 개설 후보에서 빠진다(listVersionOptions). */
export async function setProblemActive(code: string, isActive: boolean): Promise<ProblemDeleteResult> {
  const updated = await problemsRepo.setActive(code.trim(), isActive);
  if (!updated) return { ok: false, error: '문제를 찾을 수 없습니다.' };
  return { ok: true };
}

/**
 * 문제 하드 삭제 — ⭐ 어떤 버전도 회차에 안 쓰였을 때만. 쓰인 적 있으면 비활성화로 유도.
 * DB(버전+문제)는 트랜잭션으로, MinIO(scaffold 객체)는 커밋 후 `<code>/` prefix 일괄 삭제(best-effort).
 */
export async function deleteProblem(code: string): Promise<ProblemDeleteResult> {
  const c = code.trim();
  const problem = await problemsRepo.findProblemByCode(c);
  if (!problem) return { ok: false, error: '문제를 찾을 수 없습니다.' };
  if (await problemsRepo.isUsedByBatch(c)) {
    return { ok: false, error: '회차에 사용된 문제는 삭제할 수 없습니다. 대신 비활성화하세요(이력·재현성 보존).' };
  }

  await withTransaction(async (client) => {
    await problemsRepo.deleteProblemTx(client, c);
  });

  // MinIO 정리(best-effort — DB가 정보원이므로 실패해도 삭제 자체는 확정). prefix=`<code>/`.
  await removeByPrefix(BUCKETS.scaffold, `${c}/`).catch(() => undefined);
  return { ok: true };
}

/* ── 스캐폴드 미리보기(관리자 검수) — admin/problems/[code] 가 소비 ───────────
 * 업로드 결과를 눈으로 확인하는 경로: MinIO 객체를 서버가 받아 tar.gz 목록/파일을 읽는다.
 * 학생/클라이언트는 절대 이 경로를 타지 않는다(서버 전용, 버킷도 scaffold 고정). */

/** scaffold ref(`exam-scaffold/<key>`) → 객체 키. 버킷 고정 검증(다른 버킷 참조 차단). */
function scaffoldKeyFromRef(ref: string): string {
  const prefix = `${BUCKETS.scaffold}/`;
  if (!ref.startsWith(prefix)) throw new Error('scaffold ref 형식이 아닙니다.');
  return ref.slice(prefix.length);
}

/** 스캐폴드 아카이브 원본(다운로드/미리보기 공용). 크기 상한 강제. */
export async function getScaffoldArchive(ref: string): Promise<Buffer> {
  const buf = await getObjectBuffer(BUCKETS.scaffold, scaffoldKeyFromRef(ref));
  if (buf.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`아카이브가 미리보기 상한(${MAX_ARCHIVE_BYTES / 1024 / 1024}MB)을 넘습니다.`);
  }
  return buf;
}

export interface ScaffoldListing {
  entries: TgzEntry[];
  /** null = 정상. 값이 있으면 미리보기 불가 사유(.tgz 아님 등) — 다운로드로 안내. */
  error: string | null;
}

/** 스캐폴드 파일 목록. tar.gz가 아니면(zip 등) error 로 강등 — 다운로드는 여전히 가능. */
export async function listScaffoldFiles(ref: string): Promise<ScaffoldListing> {
  try {
    const archive = await getScaffoldArchive(ref);
    return { entries: listTgzEntries(archive), error: null };
  } catch (e: unknown) {
    return { entries: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export type ScaffoldFilePreview =
  | { kind: 'text'; text: string; size: number; truncated: boolean }
  | { kind: 'markdown'; text: string; size: number; truncated: boolean }
  | { kind: 'sheet'; sheets: SheetData[]; size: number }
  | { kind: 'image'; dataUri: string; mime: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

// 확장자 → MIME(인라인 이미지 미리보기). svg는 텍스트지만 이미지로 렌더.
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};
/** data URI 인라인 상한(이보다 큰 이미지는 다운로드 안내). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function extOf(path: string): string {
  return path.toLowerCase().split('.').pop() ?? '';
}

/**
 * 단일 파일 미리보기 — 확장자·내용으로 렌더 종류를 정한다:
 *   이미지(png/jpg/…) → data URI · xlsx → 시트 표 · md → 마크다운 · 그 외 텍스트 → 코드 · 나머지 → binary.
 * 전부 서버측(archive 는 scaffold 버킷 고정). 상한(크기·행·열)으로 적대적 입력 방어.
 */
export async function previewScaffoldFile(ref: string, path: string): Promise<ScaffoldFilePreview> {
  try {
    const archive = await getScaffoldArchive(ref);
    const buf = readTgzEntry(archive, path);
    if (!buf) return { kind: 'missing' };
    const ext = extOf(path);

    // 이미지: data URI 인라인(상한 초과·svg 아닌 대형은 binary 로 강등).
    const imgMime = IMAGE_MIME[ext];
    if (imgMime) {
      if (buf.length > MAX_IMAGE_BYTES) return { kind: 'binary', size: buf.length };
      return { kind: 'image', dataUri: `data:${imgMime};base64,${buf.toString('base64')}`, mime: imgMime, size: buf.length };
    }

    // xlsx: 시트 표. 파싱 실패는 binary 로 강등(깨진 파일도 화면을 막지 않음).
    if (ext === 'xlsx') {
      try {
        return { kind: 'sheet', sheets: await parseSheets(buf), size: buf.length };
      } catch {
        return { kind: 'binary', size: buf.length };
      }
    }

    // 텍스트류: NUL 있으면 binary. md 는 마크다운 렌더, 그 외는 코드.
    if (!isProbablyText(buf)) return { kind: 'binary', size: buf.length };
    const truncated = buf.length > MAX_PREVIEW_BYTES;
    const text = buf.subarray(0, MAX_PREVIEW_BYTES).toString('utf8');
    if (ext === 'md' || ext === 'markdown') return { kind: 'markdown', text, size: buf.length, truncated };
    return { kind: 'text', text, size: buf.length, truncated };
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
