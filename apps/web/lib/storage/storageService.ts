import 'server-only';
import { createHash } from 'node:crypto';
import { getStorage } from './client';
import { BUCKETS, STORAGE_BUCKET, type BucketName } from './buckets';

// storage service — MinIO 래퍼(put/get/서명URL). 실체는 MinIO, Postgres엔 포인터(ref)+해시(docs/5 §1).
// ⭐ 학생 pod/클라는 MinIO에 직접 쓰지 않는다 — 서버(앱/Job)만 쓰기(docs/5 §2). 그래서 이 모듈은 server-only.
//
// ⭐ 버킷은 catchup-bucket 하나(STORAGE_BUCKET). 함수가 받는 `bucket` 인자는 실 버킷이 아니라
//   그 버킷 안의 키 접두(폴더)다 — 실 객체 키 = `<bucket>/<key>`. ref(=`<bucket>/<key>`)와 정확히 일치.

/** 논리 접두(bucket)와 키를 실 객체 키로 접합. 실 버킷은 항상 STORAGE_BUCKET. */
function objectKey(bucket: BucketName, key: string): string {
  return `${bucket}/${key}`;
}

// 단일 버킷 존재 보장(프로세스당 1회 메모이즈). setup.sh 가 만들지만, 앱도 멱등 보강.
let ensured = false;
async function ensureBucket(): Promise<void> {
  if (ensured) return;
  const s = getStorage();
  if (!(await s.bucketExists(STORAGE_BUCKET))) await s.makeBucket(STORAGE_BUCKET);
  ensured = true;
}

/** 서버측 sha256(hex) — trust='verified'의 근거는 서버 재산출이지 클라 입력이 아니다(대원칙 ⑤). */
export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * multipart 업로드 파일명 복원 — undici(Next FormData)는 Content-Disposition 의 filename 을
 * latin1 바이트 문자열로 준다(각 바이트=한 코드포인트). 그래서 한글 UTF-8 이 'ì²´' 식 mojibake 가
 * 되어 저장 시 '_ì_ì²_…' 로 깨진다. latin1→UTF-8 로 되돌리되, 왕복 검증이 성립할 때만 복원한다
 * (ASCII·진짜 latin1 파일명은 원본 유지 — 오작동 0). 파일명을 쓰는 업로드 경계에서 호출한다.
 */
export function decodeUploadFilename(name: string): string {
  try {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    // 무손실 복원인지 왕복으로 확인 — 깨진 바이트(invalid UTF-8)면 U+FFFD 가 껴 왕복이 어긋난다.
    if (Buffer.from(utf8, 'utf8').toString('latin1') === name) return utf8.normalize('NFC');
    return name;
  } catch {
    return name;
  }
}

/**
 * 파일명 정규화: 경로탈출/특수문자 차단. basename만, 안전문자 외는 '_'.
 * ⭐ 유니코드 letter/number 보존(\p{L}\p{N}, u 플래그) — JS 기본 \w 는 ASCII 라
 *    한글 파일명이 통째로 '____' 로 깨진다. NFC 정규화 후 한글·CJK 를 그대로 살린다.
 *    ⚠️ 업로드 파일명은 먼저 decodeUploadFilename 으로 latin1 mojibake 를 풀어야 한다.
 */
export function sanitizeFilename(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? 'file').normalize('NFC');
  const safe = base.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '_');
  return safe.slice(0, 200) || 'file';
}

/** 버킷에 객체 적재(서버 전용). mime이 있으면 Content-Type 설정. */
export async function putObject(
  bucket: BucketName,
  key: string,
  body: Buffer,
  mime: string | null,
): Promise<void> {
  await ensureBucket();
  await getStorage().putObject(
    STORAGE_BUCKET,
    objectKey(bucket, key),
    body,
    body.length,
    mime ? { 'Content-Type': mime } : undefined,
  );
}

/** 객체 삭제(없으면 무시 — 멱등). 스캐폴드 교체 시 옛 키 정리용. */
export async function removeObject(bucket: BucketName, key: string): Promise<void> {
  await ensureBucket();
  await getStorage().removeObject(STORAGE_BUCKET, objectKey(bucket, key));
}

/**
 * prefix 하위 객체 일괄 삭제(멱등) — 문제 삭제 시 scaffold 객체 정리용.
 * 반환: 삭제한 객체 수.
 */
export async function removeByPrefix(bucket: BucketName, prefix: string): Promise<number> {
  await ensureBucket();
  const s = getStorage();
  const keys: string[] = [];
  const stream = s.listObjectsV2(STORAGE_BUCKET, objectKey(bucket, prefix), true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj: { name?: string }) => {
      if (obj.name) keys.push(obj.name);
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  if (keys.length > 0) await s.removeObjects(STORAGE_BUCKET, keys);
  return keys.length;
}

/** 서명 GET URL(기본 5분). artifacts/chatlogs는 비공개라 다운로드는 서명 URL로만. */
export async function presignedGetUrl(bucket: BucketName, key: string, expirySeconds = 300): Promise<string> {
  return getStorage().presignedGetObject(STORAGE_BUCKET, objectKey(bucket, key), expirySeconds);
}

/** 객체 전체를 버퍼로 회수(서버측 — 패키징/재검증용). */
export async function getObjectBuffer(bucket: BucketName, key: string): Promise<Buffer> {
  const stream = await getStorage().getObject(STORAGE_BUCKET, objectKey(bucket, key));
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks);
}

/** 헬스 체크: MinIO 도달 가능? 던지지 않고 boolean(헬스 라우트용). */
export async function pingStorage(): Promise<boolean> {
  try {
    await getStorage().listBuckets();
    return true;
  } catch {
    return false;
  }
}

export { BUCKETS, STORAGE_BUCKET, type BucketName };
