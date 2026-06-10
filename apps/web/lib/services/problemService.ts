import 'server-only';
import { withTransaction } from '../db';
import * as problemsRepo from '../db/repositories/problems';
import type { RoleTrack } from '../db/repositories/problems';
import { putObject, getObjectBuffer, removeObject, sha256, sanitizeFilename, BUCKETS } from '../storage';
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

// problemService — 문제 버전 업로드(admin). route/action은 얇게, 검증·트랜잭션·스토리지 적재는 여기서.
// ⭐ scaffold 해시는 서버 재산출(클라 입력 신뢰 금지, 대원칙 ⑤). hidden은 서버 전용 버킷 — DB에 기록하지 않는다.

const ROLE_TRACKS: readonly RoleTrack[] = ['planning', 'dev', 'marketing'];
const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export interface UploadFilePart {
  filename: string;
  mime: string | null;
  bytes: Buffer;
}

/**
 * 문제 업로드: 문제 upsert → 다음 버전 → scaffold(필수)·hidden(선택) MinIO 적재 → 버전 INSERT.
 * 전부 한 트랜잭션(게이트→put→insert 순서, submitByod와 동형). 키가 결정적이라 재시도 안전.
 * scaffold ref는 `exam-scaffold/<code>/v<version>/<name>` 포인터로만 DB에 남는다(실체는 MinIO).
 */
export async function uploadProblemVersion(input: {
  code: string;
  roleTrack: string;
  title: string;
  scaffold: UploadFilePart;
  hidden?: UploadFilePart | null;
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
  const hidden = input.hidden && input.hidden.bytes.length > 0 ? input.hidden : null;

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

    if (hidden) {
      await putObject(
        BUCKETS.hidden,
        `${code}/v${version}/${sanitizeFilename(hidden.filename)}`,
        hidden.bytes,
        hidden.mime,
      );
    }

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
  | { kind: 'binary'; size: number }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/** 단일 파일 미리보기: 텍스트면 내용(상한 256KB), 바이너리면 크기만. */
export async function previewScaffoldFile(ref: string, path: string): Promise<ScaffoldFilePreview> {
  try {
    const archive = await getScaffoldArchive(ref);
    const buf = readTgzEntry(archive, path);
    if (!buf) return { kind: 'missing' };
    if (!isProbablyText(buf)) return { kind: 'binary', size: buf.length };
    const truncated = buf.length > MAX_PREVIEW_BYTES;
    const text = buf.subarray(0, MAX_PREVIEW_BYTES).toString('utf8');
    return { kind: 'text', text, size: buf.length, truncated };
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
