# 03. 캐시 관리 (Redis 1개)

> 출처: `jabis-api-gateway/src/config/redis.ts`, `services/cacheService.ts`, `services/permissionService.ts`, `services/endpointService.ts`, `services/certService.ts`, `middleware/rateLimiter.ts`

## 핵심 한 줄
**Redis 1개를 키 prefix(namespace)로 나눠 캐시 + rate-limit + 카운터 + 세션을 모두 처리. 캐시는 절대 장애 원인이 되면 안 된다(fail-soft).**

## ⚠️ "Redis 있으면 DB 2개 아닌가?" — 아니다
- "DB 하나" = **정보원(source of truth)이 하나(Postgres)**. 프로세스 개수가 아님.
- Redis에 든 건 전부 ① Postgres에서 재생성 가능(캐시/통계) 또는 ② 휘발성(세션/카운터/잡락). **Redis 통째로 날려도 데이터 손실 0**(느려질 뿐) → 개념 층위가 DB와 다름.
- **선택지**: (A) **Redis 없이 시작** — 캐시=메모리 Map, 세션=JWT쿠키, 큐=jobs 테이블(`FOR UPDATE SKIP LOCKED`, DB만으로 됨). 초기 최선. (B) 서버 2대 이상으로 늘거나 트래픽 커지면 Redis 추가.
- `cacheService` 추상화를 유지하면 내부를 Map→Redis로 교체해도 호출부 불변. **처음엔 Map, 나중에 Redis.**

## 1. 연결: fail-soft
```ts
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (t) => Math.min(t * 50, 2000),  // 점증 백오프(최대 2초)
  lazyConnect: true,
});
```
- [x] Redis 죽어도 서버는 부팅/동작(경고만). 캐시는 보조장치이지 필수 의존성 아님.

## 2. cacheService — 캐시 단일 창구
앱은 `redis.get`을 직접 안 쓰고 항상 `cacheService`를 거친다.

### TTL은 이름 붙은 정책 (매직넘버 금지)
```ts
export const TTL = {
  TOKEN: 10,            // 보안민감 → 짧게(revoke 지연 최소화)
  PERMISSION: 60,       // 1분
  ENDPOINT: 60 * 5,     // 5분
  CONTENT: 60 * 60 * 6, // 6시간
  CONFIG: 60 * 60 * 24, // 안정적 → 길게(24시간)
} as const;
```
- TTL 길이 = **"얼마나 오래된 데이터를 견딜 수 있나(stale tolerance)"**. 보안민감=짧게, 안정설정=길게.

### fail-soft: 캐시 에러는 miss로
```ts
async get<T>(key): Promise<T|null> {
  try { const d = await redis.get(key); return d ? JSON.parse(d) : null; }
  catch { return null; }   // 에러 → miss → DB로 폴백. 요청은 안 죽음
}
```

### cache-aside = getOrSet (캐싱의 90%)
```ts
async getOrSet<T>(key, fetcher, ttl) {
  const cached = await this.get<T>(key);
  if (cached !== null) return cached;     // hit
  const data = await fetcher();           // miss → 원본 조회
  await this.set(key, data, ttl); return data;
}
// 사용: await cacheService.getOrSet('test:config:'+id, () => repo.getConfig(id), TTL.CONFIG)
```

## 3. 키 네이밍: `도메인:식별자:하위` (콜론 계층)
```
permission:${clientId}:${endpointId}
endpoint:${id}  /  endpoints:all
ratelimit:api:${clientId}:${endpointId}
quota:daily:${clientId}:${endpointId}:${date}   ← 날짜를 키에 = 자동 일일 리셋!
session:${sessionId}
```
- [x] 콜론으로 namespace 분리 → Redis 1개로 모든 용도 공존.
- [x] **날짜/버전을 키에 박으면 무효화가 자동**(새 날짜/버전 = 새 키, 옛 키는 TTL로 소멸).

## 4. ⭐ 무효화: write가 책임진다
```ts
// 읽기: getOrSet. 쓰기: 끝에 무효화. 이 짝을 항상 같이.
async update(...) { await repo.update(...); await this.invalidateCache(id); }

// 전략 A: 정확한 키 삭제 (영향 범위를 알 때 — 우선)
await cacheService.delete(`permission:${clientId}:${endpointId}`);
// 전략 B: 패턴 삭제 (모를 때 싹 비움)
await cacheService.invalidate('endpoint:*');
```
- ⚠️ **`invalidate`는 내부적으로 `redis.keys()` 사용 → 운영에서 위험(O(N) 블로킹)**. 대안: `SCAN` 쓰거나, 패턴삭제가 필요 없게 키 설계, 또는 짧은 TTL로 알아서 만료.
- 원칙: **읽기=getOrSet, 쓰기=invalidate를 항상 짝으로.**

## 5. 카운터(rate-limit / quota): INCR
```ts
const c = await redis.incr(key);
if (c === 1) await redis.expire(key, windowSec);  // ★ 첫 증가 때만 expire(매번 걸면 윈도우 무한연장 버그)
if (c > max) { reply.header('retry-after', ttl); return reply.status(429); }
```
- rate-limit은 **fail-open**(`catch {}` 후 요청 허용 — Redis 죽었다고 사용자 막지 않음). ↔ 캐시는 fail-soft. 보안↔가용성 의식적 선택.

## 6. 외부호출 캐시 + 서킷브레이커
- 토큰 검증 결과를 10초(TTL.TOKEN) 캐싱 → 매번 인증서버 안 물어봄. 짧은 TTL로 revoke 반영 보장.
- 외부 의존 호출엔 서킷브레이커(연속 실패 시 차단)로 연쇄장애 방지. 단 401/403(정상 무효응답)은 장애 아님 → 제외.

## 7. 🎯 AI 평가 플랫폼 적용
```ts
export const TTL = {
  AI_GRADE: 60*60*24*30,  // 30일 (같은 답안 재평가 불필요)
  TEST_CONFIG: 60*60, LEADERBOARD: 60, PERMISSION: 60,
};
```
### ⭐ 킬러 패턴: AI 평가 결과를 내용 해시로 캐싱 (비용 절감)
```ts
const key = `ai:grade:${rubricVersion}:${sha256(rubricId + '|' + answerText)}`;
const result = await cacheService.getOrSet(key, () => llmGrade(rubric, answer), TTL.AI_GRADE);
```
- LLM 호출은 느리고 비쌈 → "같은 루브릭+같은 답안"은 1번만 평가. 중복 제출/객관식/짧은답에서 폭발적 절감.
- 루브릭 변경 무효화 = **키에 `rubricVersion` 포함** → 버전 오르면 자동으로 새 키.

### Redis 1개 namespace 설계
```
session:${id} / ai:grade:${ver}:${hash} / test:config:${id} / leaderboard:${testId} / ratelimit:submit:${userId}
```

## 체크리스트
- [x] ioredis 1개 + retryStrategy + fail-soft
- [x] cacheService 단일 창구(get/set/getOrSet/delete/invalidate/increment)
- [x] 이름 붙은 TTL 상수 (stale tolerance로 결정)
- [x] getOrSet(cache-aside)로 읽기
- [x] `도메인:식별자:하위` 키 + 날짜/버전을 키에
- [x] write 시 invalidate (정확한 키 삭제 우선, KEYS 패턴삭제 지양)
- [x] 카운터는 INCR + count===1일 때만 expire, rate-limit은 fail-open
- [x] AI 평가은 (루브릭버전+답안)해시 키로 캐싱
