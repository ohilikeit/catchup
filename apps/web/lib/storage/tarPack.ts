import 'server-only';
import { gzipSync } from 'node:zlib';

// tar.gz 패커 — 업로드 정규화의 출력 단(zip/tgz → 표준 tgz 재포장). 의존성 0: ustar 헤더 직접 생성.
// mtime=0 고정(같은 입력 → 같은 바이트, sha256 재현성). 시드 컨테이너(tar -xzf)가 그대로 푼다.

export interface PackFile {
  path: string;
  data: Buffer;
  isDir: boolean;
  /** unix 권한(실행 비트 보존용). 0이면 기본값(file 0644 / dir 0755). */
  mode: number;
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, 'ascii');
}

/** ustar name(100)/prefix(155) 분할. 스캐폴드 수준에서 안 들어가면 명확히 거부. */
function splitName(path: string): { name: string; prefix: string } {
  const bytes = Buffer.byteLength(path, 'utf8');
  if (bytes <= 100) return { name: path, prefix: '' };
  // 100바이트 안에 들어가는 마지막 segment 경계에서 prefix/name 분할.
  for (let i = path.length - 1; i > 0; i--) {
    if (path[i] !== '/') continue;
    const name = path.slice(i + 1);
    const prefix = path.slice(0, i);
    if (Buffer.byteLength(name, 'utf8') <= 100 && Buffer.byteLength(prefix, 'utf8') <= 155) {
      return { name, prefix };
    }
  }
  throw new Error(`경로가 너무 깁니다(tar 한계): ${path.slice(0, 80)}…`);
}

function header(file: PackFile): Buffer {
  const h = Buffer.alloc(512);
  const { name, prefix } = splitName(file.isDir ? `${file.path}/` : file.path);
  h.write(name, 0, 'utf8');
  // 실행 비트는 보존하되 최소 읽기 권한은 보장(0644/0755) — 일부 압축 도구가 0600을 박는다.
  const mode = file.isDir ? (file.mode | 0o755) & 0o7777 : (file.mode | 0o644) & 0o7777;
  writeOctal(h, 100, 8, mode);
  writeOctal(h, 108, 8, 0); // uid
  writeOctal(h, 116, 8, 0); // gid
  writeOctal(h, 124, 12, file.isDir ? 0 : file.data.length);
  writeOctal(h, 136, 12, 0); // mtime — 결정적 출력
  h.fill(' ', 148, 156); // chksum 자리는 공백으로 두고 합산
  h.write(file.isDir ? '5' : '0', 156, 'ascii'); // typeflag
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  h.write(prefix, 345, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return h;
}

/** 파일 목록 → tar.gz. 디렉터리 엔트리는 그대로 보존(빈 폴더 유지). */
export function createTgz(files: PackFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    blocks.push(header(f));
    if (!f.isDir && f.data.length > 0) {
      blocks.push(f.data);
      const pad = (512 - (f.data.length % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad));
    }
  }
  blocks.push(Buffer.alloc(1024)); // 종료 블록 2개
  return gzipSync(Buffer.concat(blocks));
}
