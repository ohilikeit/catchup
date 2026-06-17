---
type: Architecture Decision
title: 성능 최적화 원칙
description: 측정 후 병목만 수정(조기 최적화 금지). DB 풀 전역 1개, N+1 회피, 페이지네이션. Next.js 자동 코드스플리팅 + dynamic import. AI 평가는 잡 큐로 비동기 분리.
resource: file:///docs/reference/09-optimization.md
tags:
  - performance
  - database
  - nextjs
  - optimization
timestamp: 2026-06-17T00:00:00Z
---

# 성능 최적화 원칙

## 핵심 결정: 측정 먼저, 추측 금지

**트래픽이 모이는 곳을 최적화한다. 추측하지 말고 측정 후 병목만.**

측정 도구:
- 느린 쿼리: `EXPLAIN ANALYZE`
- 느린 페이지: Lighthouse / React Profiler
- OpenTelemetry 풀스택은 과함 — 시작 수준에선 느린 쿼리 로깅 + Lighthouse로 충분.

## 결정 1: DB 커넥션 풀 — 전역 1개

```ts
// apps/web/lib/db/pool.ts — 모듈 전역 1개 재사용
export const pool = new Pool({ ...config, max: DATABASE_POOL_MAX });
```

⚠️ Next.js에서 pg 풀을 **매 요청 새로 만들지 말 것.** 모듈 전역 1개를 재사용한다.
DB 연결 구조는 [db-schema](/platform/db-schema.md), 연결 상태 확인은 `/api/health` 엔드포인트.

> **구현 현황**: `apps/web/lib/db/pool.ts`에 구현됨. 단, `export const pool = new Pool(...)` 방식이 아니라 **지연 생성 패턴** `export function getPool(): Pool`로 구현되어 있다. 빌드 타임에 env가 없는 문제를 피하기 위해 첫 호출 시 생성하고 `globalThis.__catchupPgPool`에 캐싱한다. 상한은 `env.dbPoolMax`로 읽는다. `/api/health`는 `pingDb()` + `pingRedis()` + `pingStorage()`를 함께 체크한다.

## 결정 2: 이미 결정된 최적화들

아래는 별도 측정 없이 처음부터 적용하는 기본 패턴이다:

| 최적화 | 위치 |
|---|---|
| 인덱스 (FK·status·created_at·복합·부분) | [db-schema](/platform/db-schema.md) |
| getOrSet 캐시 + AI 평가 해시 캐싱 | [cache](/platform/cache.md) |
| 비동기 잡 큐 (`grading.jobs`, `FOR UPDATE SKIP LOCKED`) | [db-schema](/platform/db-schema.md) |
| 병렬 페칭 (`Promise.allSettled`) | [page-routing](/platform/page-routing.md) |
| `RETURNING` — 추가 SELECT 제거 | [db-schema](/platform/db-schema.md) |

## 결정 3: N+1 회피 + 페이지네이션

```sql
-- N+1 회피: 루프 쿼리 N번 ❌ → IN 한 번 ✅
SELECT * FROM exam.submissions WHERE id = ANY($1::uuid[]);

-- 페이지네이션 필수 (깊은 페이지는 keyset 방식으로)
SELECT * FROM exam.submissions
WHERE test_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET $2;
```

N+1은 백엔드 성능 1순위 적이다. 목록은 무조건 페이지네이션한다.

## 결정 4: Next.js 자동 최적화 활용

| 최적화 | Next.js 방식 |
|---|---|
| 라우트별 코드스플리팅 | page.tsx마다 자동 (SPA 대비 최대 이득) |
| 이미지 최적화 | `next/image` |
| 폰트 CLS 방지 | `next/font` |
| JS 전송량 감소 | RSC (서버 컴포넌트) |

수동으로 추가하는 것:

```tsx
// 무거운 컴포넌트 (차트, 에디터, PDF 뷰어) 지연 로딩
const ChartPanel = dynamic(() => import('./ChartPanel'), {
  loading: () => <Skeleton />,
});
```

`useMemo`/`useCallback`/가상화는 **측정 후** 적용한다 — 무지성 memo 금지.
zustand 선택적 구독(`useStore(s => s.items)`)으로 불필요한 리렌더를 방지한다([page-routing](/platform/page-routing.md) 참조).

## 결정 5: AI 평가 비동기 분리

LLM 호출은 느리다. 동기 응답에 포함하지 않고 `grading.jobs` 잡 큐로 분리한다.
캐시로 중복 호출을 차단하고([cache](/platform/cache.md)), 잡 큐로 동시성을 제한한다([db-schema](/platform/db-schema.md)).

> **구현 현황**: `grading.jobs` 잡 큐 및 `grading` schema 전체 **미구현**. 평가·리포트 모듈은 별도 트랙으로 남아 있다([db-schema](/platform/db-schema.md) 결정 8 구현 현황 참조). `cacheService`(`getOrSet`, `TTL.AI_GRADE`)는 구현되어 있어 캐시 레이어는 준비됨.

# Citations

1. `docs/reference/09-optimization.md` — 최적화 원문
2. `docs/reference/02-db-schema.md` — 인덱스, 잡 큐, RETURNING
3. `docs/reference/03-cache.md` — getOrSet, AI 평가 해시 캐싱
4. `docs/reference/06-page-routing.md` — Promise.allSettled, zustand 선택 구독
