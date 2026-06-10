import 'server-only';
import { isZip, extractZipEntries } from './zipExtract';
import { extractTgzEntries } from './tgzPreview';
import { createTgz, type PackFile } from './tarPack';

// 스캐폴드 정규화 — 업로드(zip/tgz)를 "학생 워크스페이스에 그대로 풀리는 표준 tgz"로 변환.
//   ① 쓰레기 파일 제거(__MACOSX·.DS_Store 등)  ② 단일 루트 폴더 wrapping 평탄화
//   ③ 결정적 tgz 재포장(mtime=0 — 같은 입력이면 같은 sha256)
// 어떤 도구(Windows zip·macOS·tar)로 묶어도 학생에겐 항상 올바른 루트 구조가 보이게 한다.

const JUNK_RE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

export interface NormalizeSummary {
  /** 정규화 후 파일 수(디렉터리 제외). */
  fileCount: number;
  /** 벗겨낸 wrapping 폴더 단계 수(0이면 원래 루트가 올바름). */
  flattened: number;
  /** 제거한 쓰레기 항목 수. */
  droppedJunk: number;
}

function isGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/**
 * zip/tgz → 표준 tgz. 형식 불명·빈 아카이브는 명확한 에러로 거부.
 * 평탄화 규칙: 루트에 디렉터리 1개만 있으면 그 안의 내용을 루트로 끌어올린다(중첩 반복).
 * 루트에 파일이 하나라도 있으면 이미 올바른 구조로 보고 건드리지 않는다.
 */
export function normalizeScaffoldArchive(bytes: Buffer): { tgz: Buffer; summary: NormalizeSummary } {
  let entries: PackFile[];
  if (isZip(bytes)) {
    entries = extractZipEntries(bytes);
  } else if (isGzip(bytes)) {
    entries = extractTgzEntries(bytes);
  } else {
    throw new Error('지원하지 않는 형식입니다 — .zip 또는 .tgz(tar.gz)로 묶어 올리세요.');
  }

  let files = entries.filter((e) => e.path && !JUNK_RE.test(e.path));
  const droppedJunk = entries.length - files.length;

  let flattened = 0;
  for (;;) {
    const roots = new Set(files.map((e) => e.path.split('/')[0]!));
    if (roots.size !== 1) break;
    const root = [...roots][0]!;
    const isWrapper = files.every((e) => (e.path === root ? e.isDir : e.path.startsWith(`${root}/`)));
    if (!isWrapper) break;
    files = files
      .filter((e) => e.path !== root)
      .map((e) => ({ ...e, path: e.path.slice(root.length + 1) }));
    flattened++;
    if (flattened > 16) break; // 비정상 중첩 가드
  }

  const fileCount = files.filter((e) => !e.isDir).length;
  if (fileCount === 0) {
    throw new Error('아카이브 안에 파일이 없습니다 — 묶은 내용물을 확인하세요.');
  }

  return { tgz: createTgz(files), summary: { fileCount, flattened, droppedJunk } };
}

/** 업로드 파일명 → 저장 파일명(.tgz 강제). 변환 후엔 항상 tgz이므로 확장자도 그에 맞춘다. */
export function normalizedScaffoldName(filename: string): string {
  const base = filename.replace(/\.(zip|tgz|tar\.gz|tar|gz)$/i, '');
  return `${base || 'scaffold'}.tgz`;
}
