import 'server-only';
import { createHash } from 'node:crypto';
import { getStorage } from './client';
import { BUCKETS, type BucketName } from './buckets';

// storage service — MinIO 래퍼(put/get/서명URL). 실체는 MinIO, Postgres엔 포인터(ref)+해시(docs/5 §1).
// ⭐ 학생 pod/클라는 MinIO에 직접 쓰지 않는다 — 서버(앱/Job)만 쓰기(docs/5 §2). 그래서 이 모듈은 server-only.

// 버킷 존재 보장(프로세스당 1회 메모이즈). docker-compose minio-init이 만들지만, 앱도 멱등 보강.
const ensured = new Set<string>();
async function ensureBucket(bucket: BucketName): Promise<void> {
  if (ensured.has(bucket)) return;
  const s = getStorage();
  if (!(await s.bucketExists(bucket))) await s.makeBucket(bucket);
  ensured.add(bucket);
}

/** 서버측 sha256(hex) — trust='verified'의 근거는 서버 재산출이지 클라 입력이 아니다(대원칙 ⑤). */
export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 파일명 정규화: 경로탈출/특수문자 차단. basename만, 안전문자 외는 '_'. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const safe = base.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '_');
  return safe.slice(0, 200) || 'file';
}

/** 버킷에 객체 적재(서버 전용). mime이 있으면 Content-Type 설정. */
export async function putObject(
  bucket: BucketName,
  key: string,
  body: Buffer,
  mime: string | null,
): Promise<void> {
  await ensureBucket(bucket);
  await getStorage().putObject(bucket, key, body, body.length, mime ? { 'Content-Type': mime } : undefined);
}

/** 객체 삭제(없으면 무시 — 멱등). 스캐폴드 교체 시 옛 키 정리용. */
export async function removeObject(bucket: BucketName, key: string): Promise<void> {
  await ensureBucket(bucket);
  await getStorage().removeObject(bucket, key);
}

/**
 * prefix 하위 객체 일괄 삭제(멱등) — 문제 삭제 시 scaffold/hidden 정리용.
 * hidden은 키를 DB에 기록하지 않으므로(서버 전용) prefix(`<code>/`)로 쓸어야 한다.
 * 반환: 삭제한 객체 수.
 */
export async function removeByPrefix(bucket: BucketName, prefix: string): Promise<number> {
  await ensureBucket(bucket);
  const s = getStorage();
  const keys: string[] = [];
  const stream = s.listObjectsV2(bucket, prefix, true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj: { name?: string }) => {
      if (obj.name) keys.push(obj.name);
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  if (keys.length > 0) await s.removeObjects(bucket, keys);
  return keys.length;
}

/** 서명 GET URL(기본 5분). artifacts/chatlogs는 비공개라 다운로드는 서명 URL로만. */
export async function presignedGetUrl(bucket: BucketName, key: string, expirySeconds = 300): Promise<string> {
  return getStorage().presignedGetObject(bucket, key, expirySeconds);
}

/** 객체 전체를 버퍼로 회수(서버측 — 패키징/재검증용). */
export async function getObjectBuffer(bucket: BucketName, key: string): Promise<Buffer> {
  const stream = await getStorage().getObject(bucket, key);
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

export { BUCKETS, type BucketName };
