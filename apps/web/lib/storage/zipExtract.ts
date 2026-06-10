import 'server-only';
import { inflateRawSync } from 'node:zlib';

// zip 추출기 — 업로드 정규화(zip→tgz 변환) 전용. 의존성 0: central directory 직접 파싱.
// 풀 기능 zip 라이브러리가 아니다: 스캐폴드 수준(소형·비암호화·zip64 미만)만 지원하고
// 그 밖은 명확한 에러로 거부한다. ⚠️ 업로드 파일은 적대적(대원칙 ⑤): 엔트리 수·해제 크기 상한 강제.

export interface ZipEntry {
  path: string;
  data: Buffer;
  isDir: boolean;
  /** unix mode(만든 OS가 unix일 때만 유효한 값, 아니면 0). */
  mode: number;
}

const MAX_ENTRIES = 2000;
const MAX_TOTAL_UNPACKED = 128 * 1024 * 1024;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** zip 매직 바이트(PK\x03\x04 / 빈 zip PK\x05\x06). */
export function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

/** EOCD(End of Central Directory) 위치 — 뒤에서부터 시그니처 스캔(주석 최대 64KB 허용). */
function findEocd(buf: Buffer): number {
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('zip 형식이 아니거나 손상됐습니다(EOCD 없음).');
}

/**
 * 파일명 디코드: UTF-8 플래그(bit 11)면 utf8, 아니면 EUC-KR 시도(Windows 압축의 한글 파일명)
 * 후 utf8 폴백. 한국 대학 관리자의 Windows zip을 1순위로 배려한 선택.
 */
function decodeName(raw: Buffer, gpFlag: number): string {
  if (gpFlag & 0x0800) return raw.toString('utf8');
  try {
    return new TextDecoder('euc-kr', { fatal: true }).decode(raw);
  } catch {
    return raw.toString('utf8');
  }
}

/** zip 전체 추출. 비암호화·store(0)/deflate(8)만 — 그 외는 명확히 거부. */
export function extractZipEntries(zip: Buffer): ZipEntry[] {
  const eocd = findEocd(zip);
  const total = zip.readUInt16LE(eocd + 10);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRIES) throw new Error(`zip 항목이 너무 많습니다(${total} > ${MAX_ENTRIES}).`);
  if (cdOffset === 0xffffffff) throw new Error('zip64 형식은 지원하지 않습니다 — 4GB 미만으로 묶으세요.');

  const out: ZipEntry[] = [];
  let off = cdOffset;
  let unpackedTotal = 0;

  for (let i = 0; i < total; i++) {
    if (off + 46 > zip.length || zip.readUInt32LE(off) !== SIG_CENTRAL) {
      throw new Error('zip central directory가 손상됐습니다.');
    }
    const versionMadeBy = zip.readUInt16LE(off + 4);
    const gpFlag = zip.readUInt16LE(off + 8);
    const method = zip.readUInt16LE(off + 10);
    const compSize = zip.readUInt32LE(off + 20);
    const uncompSize = zip.readUInt32LE(off + 24);
    const nameLen = zip.readUInt16LE(off + 28);
    const extraLen = zip.readUInt16LE(off + 30);
    const commentLen = zip.readUInt16LE(off + 32);
    const extAttrs = zip.readUInt32LE(off + 38);
    const localOff = zip.readUInt32LE(off + 42);
    const path = decodeName(zip.subarray(off + 46, off + 46 + nameLen), gpFlag);
    off += 46 + nameLen + extraLen + commentLen;

    if (gpFlag & 0x0001) throw new Error('암호화된 zip은 지원하지 않습니다.');

    // local header에서 실제 데이터 시작점 계산(local의 name/extra 길이는 central과 다를 수 있음).
    if (localOff + 30 > zip.length || zip.readUInt32LE(localOff) !== SIG_LOCAL) {
      throw new Error('zip local header가 손상됐습니다.');
    }
    const lNameLen = zip.readUInt16LE(localOff + 26);
    const lExtraLen = zip.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(dataStart, dataStart + compSize);

    const unixMode = versionMadeBy >> 8 === 3 ? (extAttrs >>> 16) & 0o7777 : 0;
    const isDir = path.endsWith('/') || ((extAttrs >>> 16) & 0o170000) === 0o040000;

    unpackedTotal += uncompSize;
    if (unpackedTotal > MAX_TOTAL_UNPACKED) {
      throw new Error(`해제 후 총 크기가 상한(${MAX_TOTAL_UNPACKED / 1024 / 1024}MB)을 넘습니다.`);
    }

    let data: Buffer;
    if (isDir) {
      data = Buffer.alloc(0);
    } else if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      data = inflateRawSync(raw, { maxOutputLength: MAX_TOTAL_UNPACKED });
    } else {
      throw new Error(`지원하지 않는 zip 압축 방식(method=${method})입니다 — 일반(deflate) zip으로 묶으세요.`);
    }

    out.push({ path: path.replace(/\/+$/, ''), data, isDir, mode: unixMode });
  }
  return out;
}
