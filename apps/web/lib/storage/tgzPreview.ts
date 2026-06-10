import 'server-only';
import { gunzipSync } from 'node:zlib';

// tar.gz 미리보기 파서 — 스캐폴드(소형 아카이브) 열람 전용. 의존성 0: POSIX/GNU tar 헤더 직접 파싱.
// 풀 추출이 아니라 "목록 + 단일 파일 읽기"만 — 관리자 검수 화면(admin/problems/[code])이 소비한다.
// ⚠️ 업로드 파일은 적대적일 수 있다(대원칙 ⑤): gunzip 출력 상한(압축폭탄)·미리보기 크기 상한을 강제.

export interface TgzEntry {
  path: string;
  size: number;
  isDir: boolean;
}

/** 압축 객체(아카이브 자체) 상한 — 이보다 크면 미리보기 대신 다운로드 안내. */
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
/** gunzip 출력 상한(압축폭탄 방어). 초과 시 zlib이 던진다. */
const MAX_UNPACKED_BYTES = 128 * 1024 * 1024;
/** 단일 파일 텍스트 미리보기 상한. */
export const MAX_PREVIEW_BYTES = 256 * 1024;

function gunzipCapped(tgz: Buffer): Buffer {
  return gunzipSync(tgz, { maxOutputLength: MAX_UNPACKED_BYTES });
}

function readString(buf: Buffer, offset: number, length: number): string {
  const end = buf.indexOf(0, offset);
  const stop = end === -1 || end > offset + length ? offset + length : end;
  return buf.subarray(offset, stop).toString('utf8');
}

function parseOctal(header: Buffer, offset: number, length: number): number {
  const raw = readString(header, offset, length).trim();
  const n = parseInt(raw, 8);
  return Number.isFinite(n) ? n : 0;
}

/** POSIX ustar: name(0,100) + prefix(345,155). */
function entryName(header: Buffer): string {
  const name = readString(header, 0, 100);
  const prefix = readString(header, 345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

/** 표시용 경로 정규화: 선행 './' 제거. 경로탈출('..')은 호출부에서 걸러낸다. */
function cleanPath(p: string): string {
  return p.replace(/^\.\/+/, '');
}

interface RawEntry {
  path: string;
  size: number;
  typeflag: string;
  dataStart: number;
}

function* iterateTar(tar: Buffer): Generator<RawEntry> {
  let offset = 0;
  let longName: string | null = null; // GNU 'L' 확장 헤더(긴 파일명)
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // 종료 블록
    const size = parseOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156]!);
    const dataStart = offset + 512;
    const advance = 512 + Math.ceil(size / 512) * 512;

    if (typeflag === 'L') {
      // 다음 엔트리의 실제 이름이 데이터 블록에 들어 있다.
      longName = tar.subarray(dataStart, dataStart + size).toString('utf8').replace(/\0+$/, '');
      offset += advance;
      continue;
    }
    if (typeflag === 'x' || typeflag === 'g') {
      // pax 확장 헤더 — 경로 override는 미지원(스캐폴드 수준에선 불필요). 페이로드 스킵.
      offset += advance;
      continue;
    }

    const path = cleanPath(longName ?? entryName(header));
    longName = null;
    yield { path, size, typeflag, dataStart };
    offset += advance;
  }
}

function isRegular(typeflag: string): boolean {
  return typeflag === '0' || typeflag === '\0';
}

/** 아카이브 내 파일/디렉터리 목록(경로 정렬). 일반 파일·디렉터리만 — 링크류는 제외. */
export function listTgzEntries(tgz: Buffer): TgzEntry[] {
  const tar = gunzipCapped(tgz);
  const out: TgzEntry[] = [];
  for (const e of iterateTar(tar)) {
    if (!e.path || e.path.split('/').includes('..')) continue;
    const isDir = e.typeflag === '5' || e.path.endsWith('/');
    if (!isDir && !isRegular(e.typeflag)) continue;
    out.push({ path: isDir ? e.path.replace(/\/+$/, '') : e.path, size: e.size, isDir });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export interface TgzFullEntry {
  path: string;
  data: Buffer;
  isDir: boolean;
  /** tar 헤더의 unix 권한(재포장 시 실행 비트 보존용). */
  mode: number;
}

/** 아카이브 전체 추출(정규화·재포장용). 일반 파일·디렉터리만. */
export function extractTgzEntries(tgz: Buffer): TgzFullEntry[] {
  const tar = gunzipCapped(tgz);
  const out: TgzFullEntry[] = [];
  for (const e of iterateTar(tar)) {
    if (!e.path || e.path.split('/').includes('..')) continue;
    const isDir = e.typeflag === '5' || e.path.endsWith('/');
    if (!isDir && !isRegular(e.typeflag)) continue;
    const header = tar.subarray(e.dataStart - 512, e.dataStart);
    out.push({
      path: e.path.replace(/\/+$/, ''),
      data: isDir ? Buffer.alloc(0) : Buffer.from(tar.subarray(e.dataStart, e.dataStart + e.size)),
      isDir,
      mode: parseOctal(header, 100, 8) & 0o7777,
    });
  }
  return out;
}

/** 단일 파일 내용 읽기(정확한 경로 일치). 없으면 null. */
export function readTgzEntry(tgz: Buffer, path: string): Buffer | null {
  const tar = gunzipCapped(tgz);
  for (const e of iterateTar(tar)) {
    if (!isRegular(e.typeflag)) continue;
    if (e.path === path) return Buffer.from(tar.subarray(e.dataStart, e.dataStart + e.size));
  }
  return null;
}

/** 텍스트 추정: 앞 8KB에 NUL 바이트가 없으면 텍스트로 본다(미리보기 가능 판단용). */
export function isProbablyText(buf: Buffer): boolean {
  return !buf.subarray(0, 8192).includes(0);
}
