import 'server-only';
import { getRedis } from './redis';

// cacheService — 캐시 단일 창구. 앱은 redis.get을 직접 쓰지 않고 항상 이걸 거친다.
// 근거: reference/03 §2(단일 창구·fail-soft), §4(무효화는 write가 책임), §5(카운터 INCR).
//
// 키 네이밍 규약: `도메인:식별자:하위` (콜론 계층). 날짜/버전을 키에 박으면 무효화가 자동(§3).

/** fail-soft: 캐시 에러는 miss로 처리 → DB로 폴백, 요청은 안 죽음(reference/03 §2). */
async function get<T>(key: string): Promise<T | null> {
  try {
    const data = await getRedis().get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

async function set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // fail-soft: 캐시 쓰기 실패는 무시(다음 요청이 다시 채움)
  }
}

/**
 * cache-aside = getOrSet (캐싱의 90%). hit이면 캐시, miss면 fetcher로 원본 조회 후 채움.
 * 예: cacheService.getOrSet(`org:${id}`, () => organizationsRepo.findById(id), TTL.CONFIG)
 */
async function getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
  const cached = await get<T>(key);
  if (cached !== null) return cached; // hit
  const data = await fetcher(); // miss → 원본
  await set(key, data, ttlSeconds);
  return data;
}

/** 정확한 키 삭제(영향 범위를 알 때 — 우선 전략, reference/03 §4 전략 A). */
async function del(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await getRedis().del(...keys);
  } catch {
    // fail-soft
  }
}

/**
 * 패턴 삭제(영향 범위를 모를 때). ⚠️ KEYS(O(N) 블로킹) 대신 SCAN으로 순회 — 운영 안전(reference/03 §4).
 * 가능하면 패턴삭제가 필요 없게 키를 설계하거나 짧은 TTL로 만료시키는 게 우선.
 */
async function invalidate(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, batch] = await getRedis().scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (batch.length > 0) await getRedis().del(...batch);
    } while (cursor !== '0');
  } catch {
    // fail-soft
  }
}

/**
 * 카운터(rate-limit / quota). INCR + 첫 증가일 때만 expire(매번 걸면 윈도우 무한연장 버그, reference/03 §5).
 * rate-limit은 fail-open: Redis가 죽으면 막지 않고 통과시킨다(가용성 우선 — 캐시의 fail-soft와 의식적 구분).
 */
async function increment(key: string, windowSeconds: number): Promise<number> {
  try {
    const count = await getRedis().incr(key);
    if (count === 1) await getRedis().expire(key, windowSeconds);
    return count;
  } catch {
    return 0; // fail-open: 0 = "제한 없음"으로 호출부가 통과 처리
  }
}

export const cacheService = { get, set, getOrSet, del, invalidate, increment } as const;
