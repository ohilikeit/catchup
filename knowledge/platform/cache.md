---
type: Architecture Decision
title: 캐시 관리 (Redis 1개 + cacheService 추상화)
description: Redis 1개를 키 prefix(namespace)로 나눠 캐시·rate-limit·카운터를 처리. 처음엔 메모리 Map으로 시작하고 필요 시 Redis로 교체. 캐시는 절대 장애 원인이 되면 안 된다(fail-soft).
resource: file:///docs/reference/03-cache.md
tags:
  - cache
  - redis
  - performance
  - ai-grading
timestamp: 2026-06-17T00:00:00Z
---

# 캐시 관리 (Redis 1개 + cacheService 추상화)

## 핵심 결정: Redis는 보조 장치, 정보원은 Postgres

"DB 하나" 원칙은 **정보원(source of truth)이 하나(Postgres)**라는 의미다. Redis에 든 것은 전부
① Postgres에서 재생성 가능(캐시/통계) 또는 ② 휘발성(세션/카운터)이다.
**Redis 통째로 날려도 데이터 손실 0** — 느려질 뿐이다.

[db-schema](/platform/db-schema.md)의 단일 DB 원칙과 같은 맥락이다.

## 결정 1: 처음엔 메모리 Map, 필요 시 Redis

- 서버 1대, 트래픽 작을 때: 캐시=메모리 Map, 세션=JWT 쿠키, 큐=`grading.jobs` 테이블.
- 서버 2대 이상 또는 트래픽 커지면 Redis 추가.
- `cacheService` 추상화를 유지하면 **내부를 Map→Redis로 교체해도 호출부 불변**.

> **구현 현황**: 메모리 Map 단계를 거치지 않고 처음부터 **ioredis(Redis) 직접 구현**. `apps/web/lib/cache/redis.ts`에 `getRedis()`(지연 생성·globalThis 캐시)로 구현되어 있다. 세션도 JWT가 아닌 **HMAC-SHA256 서명 쿠키**(jose/jsonwebtoken 미사용)로 구현됨 — `apps/web/lib/auth/session.ts` 참조. `grading.jobs`는 미구현.

## 결정 2: fail-soft 연결

```ts
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (t) => Math.min(t * 50, 2000),  // 점증 백오프, 최대 2초
  lazyConnect: true,
});
```

Redis가 죽어도 서버는 부팅·동작한다(경고만). 캐시 에러는 miss로 처리해 DB로 폴백한다.

## 결정 3: cacheService — 캐시 단일 창구

앱은 `redis.get`을 직접 쓰지 않고 항상 `cacheService`를 거친다.
구현 위치: `apps/web/lib/cache/`.

### 이름 붙은 TTL 상수 (매직넘버 금지)

```ts
export const TTL = {
  TOKEN:      10,             // 보안 민감 → 짧게 (revoke 지연 최소화)
  PERMISSION: 60,             // 1분
  ENDPOINT:   60 * 5,         // 5분
  CONTENT:    60 * 60 * 6,    // 6시간
  CONFIG:     60 * 60 * 24,   // 안정적 설정 → 24시간
  AI_GRADE:   60 * 60 * 24 * 30,  // AI 평가 결과 → 30일
} as const;
```

TTL 길이 = **"얼마나 오래된 데이터를 견딜 수 있나(stale tolerance)"**. 보안 민감=짧게, 안정 설정=길게.

> **구현 현황**: `apps/web/lib/cache/ttl.ts`의 실제 TTL 키는 위 목록과 다르다. `ENDPOINT` 키는 없고, 대신 아래가 구현되어 있다:
> ```ts
> TOKEN: 10, PERMISSION: 60, SESSION: 60*60*12,
> BATCH_STATUS: 30, TEST_CONFIG: 60*60,
> CONTENT: 60*60*6, CONFIG: 60*60*24, AI_GRADE: 60*60*24*30
> ```
> 추가된 키: `SESSION`(12시간), `BATCH_STATUS`(30초), `TEST_CONFIG`(1시간). 제거된 키: `ENDPOINT`.

### cache-aside = getOrSet (캐싱의 90%)

```ts
async getOrSet<T>(key, fetcher, ttl) {
  const cached = await this.get<T>(key);
  if (cached !== null) return cached;      // hit
  const data = await fetcher();            // miss → 원본 조회
  await this.set(key, data, ttl);
  return data;
}
```

## 결정 4: 키 네이밍 — `도메인:식별자:하위` (콜론 계층)

```
session:${id}
ai:grade:${rubricVersion}:${hash}
test:config:${id}
leaderboard:${testId}
ratelimit:submit:${userId}
```

날짜/버전을 키에 포함하면 **무효화가 자동**이다. 새 날짜/버전 = 새 키, 옛 키는 TTL로 소멸.

## 결정 5: write가 invalidate를 책임진다

```ts
// 읽기: getOrSet. 쓰기: 끝에 무효화. 이 짝을 항상 같이 쓴다.
async update(...) {
  await repo.update(...);
  await cacheService.delete(`permission:${clientId}:${endpointId}`);  // 정확한 키 삭제 우선
}
```

⚠️ 패턴 삭제(`redis.keys('endpoint:*')`)는 내부적으로 O(N) 블로킹이다. 대안: `SCAN` 사용하거나,
패턴 삭제가 필요 없게 키를 설계하거나, 짧은 TTL로 자연 만료에 맡긴다.

## 결정 6: 카운터 rate-limit — INCR + fail-open

```ts
const c = await redis.incr(key);
if (c === 1) await redis.expire(key, windowSec);  // 첫 증가 때만 expire (매번 걸면 윈도우 무한 연장 버그)
if (c > max) return 429;
```

rate-limit은 **fail-open** — Redis 죽어도 사용자를 막지 않는다. 캐시 fail-soft와 같은 원칙의 다른 적용.
로그인 실패 차단 등 보안 목적 rate-limit 세부는 [security](/platform/security.md) 참조.

## 결정 7: AI 평가 결과 해시 캐싱 (핵심 비용 절감)

```ts
const key = `ai:grade:${rubricVersion}:${sha256(rubricId + '|' + answerText)}`;
const result = await cacheService.getOrSet(key, () => llmGrade(rubric, answer), TTL.AI_GRADE);
```

LLM 호출은 느리고 비싸다. "같은 루브릭 + 같은 답안"은 1번만 평가한다.
루브릭 변경 무효화는 키에 `rubricVersion`을 포함하므로 자동으로 새 키가 생성된다.

비동기 잡 큐와의 연계: [db-schema](/platform/db-schema.md)의 `grading.jobs` + 이 캐시가 함께 AI 평가 비용을 최소화한다.
AI 프롬프트 인젝션 방어는 [security](/platform/security.md) 참조.

# Citations

1. `docs/reference/03-cache.md` — 캐시 관리 원문
2. `docs/reference/00-master-checklist.md` — Phase 5 캐시 체크리스트
3. `docs/reference/02-db-schema.md` — grading.jobs 잡 큐 (캐시와 연계)
4. `docs/reference/05-security.md` — rate-limit, AI 비용 DoS 방어
