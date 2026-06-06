# 09. 최적화

> 출처: `jabis-api-gateway/src/config/database.ts`, `jabis-hr/apps/hr/vite.config.js`, 2~3·6단계 연계

## 핵심 한 줄
**트래픽이 모이는 곳을 최적화한다. 추측하지 말고 측정 후 병목만. 조기 최적화 금지.**

## 0. JABIS의 비대칭(맥락 읽기)
- 백엔드는 무겁게 최적화(풀/캐시/인덱스/잡큐), **프론트 번들은 거의 안 함(코드스플리팅 0)**.
- 이유: 사내 도구(한정 사용자, 빠른 사내망) → 번들 덜 중요, 백엔드 트래픽 집중.
- **나는 다름**: 응시자가 외부/폰 접속 → 프론트 최적화 중요. 다행히 Next가 자동.

## 1. 백엔드
### DB 커넥션 풀 (전역 1개)
```ts
export const pool = new Pool({ ..., max: DATABASE_POOL_MAX });  // 미리 만들어 재사용, 상한
```
- ⚠️ Next.js에서 pg 풀을 **매 요청 새로 만들지 말 것**. 모듈 전역 1개 재사용.

### 이미 배운 것 = 최적화의 핵심
- 인덱스(02): FK·status·created_at DESC·복합·부분.
- 캐시(03): getOrSet, AI 채점 해시 캐싱.
- 비동기 잡 큐(02): 느린 LLM 채점 분리.
- 병렬 페칭(06): Promise.allSettled. RETURNING(02): 추가 SELECT 제거.

### 추가
```sql
-- N+1 회피: 루프 쿼리 N번 ❌ → IN 한 번 ✅
SELECT * FROM submissions WHERE id = ANY($1);
-- 페이지네이션 필수
SELECT * FROM submissions WHERE test_id=$1 ORDER BY created_at DESC LIMIT 20 OFFSET $2;
```
- [x] N+1은 백엔드 성능 1순위 적. 목록은 무조건 페이지네이션(깊은 페이지는 keyset).

## 2. 프론트엔드 — Next.js가 자동으로
| 최적화 | Next.js |
|---|---|
| 라우트별 코드스플리팅 | ✅ page.tsx마다 자동 (SPA 대비 최대 이득) |
| 이미지 | ✅ next/image |
| 폰트 | ✅ next/font (Pretendard, CLS 방지) |
| SSR/RSC | ✅ JS 전송량↓ |

수동으로 할 것:
```tsx
const ChartPanel = dynamic(() => import('./ChartPanel'), { loading: () => <Skeleton/> })  // 무거운 컴포넌트 지연
```
- [x] 차트/에디터/뷰어 등 무거운 건 `dynamic`. next/image·next/font 사용. Suspense 스트리밍.
- React: useMemo/useCallback/가상화는 **측정 후**(무지성 memo 금지). zustand 선택구독(06).

## 3. 원칙: 측정 먼저
- 느린 쿼리 `EXPLAIN ANALYZE`, 느린 페이지 Lighthouse/Profiler → 병목만 수정.
- 시작 수준: 느린 쿼리 로깅 + Lighthouse(OpenTelemetry 풀스택은 과함).

## 체크리스트
- [x] DB 풀 전역 1개
- [x] 인덱스/캐시/잡큐/N+1회피/페이지네이션
- [x] Next 자동 코드스플리팅 + dynamic/next-image/next-font
- [x] 측정 후 최적화, 조기최적화 금지
