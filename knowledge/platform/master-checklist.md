---
type: Playbook
title: AI 평가 플랫폼 구축 마스터 체크리스트
description: JABIS 분석에서 추출한 실제 구축 순서 — Phase 0(뼈대)부터 Phase 5(성능/캐시)까지 단계별 체크리스트.
resource: file:///docs/reference/00-master-checklist.md
tags:
  - playbook
  - build-order
  - architecture
timestamp: 2026-06-17T00:00:00Z
---

# AI 평가 플랫폼 구축 마스터 체크리스트

이 플레이북은 `docs/reference/00-master-checklist.md`에서
추출한 확정 구축 순서다. 각 Phase는 후속 Phase의 선결 조건이므로 순서를 지킨다.

## 확정 아키텍처 (결정 완료)

- **Next.js App Router 통합형** — 프론트+API 한 앱. 롤모델 = jabis-cert.
- **모노레포** — `apps/web` + `packages/ui`, `packages/core`.
- **단일 PostgreSQL** + 선택적 Redis. self-host(`output: 'standalone'`).
- 분리형(SPA + API 게이트웨이)은 조직 규모 요구용 → 현재 불필요.

세부 아키텍처 결정은 [framework-monorepo](/platform/framework-monorepo.md) 참조.

---

## 관통 대원칙 5

모든 Phase에서 아래 5개 원칙이 위반되면 멈추고 재검토한다.

1. **경계를 이름으로** — 패키지 분리, DB schema 분리. 출처가 이름에 보이게.
2. **불변식은 DB가 강제** — NOT NULL/UNIQUE/FK/CHECK/트리거. 앱 코드를 믿지 말 것.
3. **단순함은 의도된 선택** — 분리·추상화는 요구가 생길 때만. 처음부터 과설계 금지.
4. **패턴 > 도구** — 프레임워크를 바꿔도 설계 원칙(레이어, 응답봉투, 검증)은 그대로 이식.
5. **클라이언트 입력은 적대적** — 점수·역할·소유권은 전부 서버가 재판단.

---

## Phase 0 — 뼈대

참조 문서: [framework-monorepo](/platform/framework-monorepo.md)

- [ ] 모노레포: `apps/web` + `packages/ui` + `packages/core`, `pnpm-workspace.yaml`
- [ ] Next.js App Router + `transpilePackages: ['@app/ui', '@app/core']`
- [ ] 패키지 `"main": "./src/index.ts"` (빌드없음) + peerDeps로 react 단일화
- [ ] `output: 'standalone'`, `.env.development` / `.env.production`
- [ ] API 응답 봉투 `{ success, data, error }` + fetch 래퍼(core)

## Phase 1 — DB

참조 문서: [db-schema](/platform/db-schema.md)

- [ ] 단일 DB + schema 분리 (`auth`, `exam`, `grading`)
- [ ] 공유 `set_updated_at()` 트리거 함수 1개 (`public` schema에)
- [ ] 테이블: PK(UUID/TEXT/BIGSERIAL 용도별), TIMESTAMPTZ audit 컬럼, 상태=CHECK
- [ ] 인덱스: FK·status·created_at DESC·복합·부분
- [ ] 강한 FK+CASCADE(도메인 내) / 약한 참조(도메인 간)
- [ ] `grading.jobs` 잡 큐 + `FOR UPDATE SKIP LOCKED`
- [ ] `grading.score_history` 점수 변경 이력
- [ ] 마이그레이션 도구(Prisma/Drizzle), 데이터 변환은 6원칙(백업/트랜잭션/멱등)
- [ ] repository: `$1` 바인딩, 행 매퍼, `RETURNING`

## Phase 2 — 인증/역할/보안

참조 문서: [auth-roles](/platform/auth-roles.md) · [security](/platform/security.md)

- [ ] 역할 4개: examinee / grader / author / admin, `auth.user_roles` M:N
- [ ] 인증≠인가 분리, 핸들러 래퍼에 `requireAuth` / `requireRole`
- [ ] 로그인 시 역할을 세션/JWT(jose)에 적재
- [ ] 비밀번호 bcrypt, 시크릿 비교 `timingSafeEqual`
- [ ] 세션 = httpOnly + secure + sameSite 쿠키 (localStorage 금지)
- [ ] **백엔드에서 역할 재검사** (프론트는 UX만) + 자원 소유권(행 단위)
- [ ] 출력 이스케이프(XSS), `$1`(SQLi), 로그인 실패 차단
- [ ] AI: 점수 서버 계산, 프롬프트 인젝션 방어(답안 격리 + 출력 스키마 검증)

## Phase 3 — UI 기반

참조 문서: [design-system](/platform/design-system.md) · [responsive](/platform/responsive.md)

- [ ] IBM Carbon 기반 `@app/ui` 컴포넌트 구축 (shadcn CLI 미사용)
- [ ] 2겹 CSS 토큰(raw Carbon 램프 → semantic 역할) + next-themes 다크모드
- [ ] 도메인 토큰 (`--score-pass/fail/partial`) — 평가 기능 착수 시 추가
- [ ] 모바일 퍼스트, 응시 화면 특히. 반응형 그리드 / 사이드바(Sheet)

## Phase 4 — 페이지/기능

참조 문서: [page-routing](/platform/page-routing.md)

- [ ] `(dashboard)/layout.tsx` 영속 셸 (역할별 메뉴 필터)
- [ ] 라우트: `exams`, `exams/[id]`, `grading`, `grading/[id]`, `authoring`
- [ ] 초기 데이터 = 서버 컴포넌트 fetch, 상호작용 = zustand
- [ ] mock fallback으로 백엔드 전 UI 개발, `Promise.allSettled`

## Phase 5 — 성능/캐시

참조 문서: [cache](/platform/cache.md) · [optimization](/platform/optimization.md)

- [ ] 캐시 추상화(`cacheService`): 처음 메모리 Map → 필요 시 Redis
- [ ] AI 평가 해시 캐싱 (`ai:grade:${rubricVer}:${hash}`)
- [ ] DB 풀 전역 1개, N+1 회피, 페이지네이션
- [ ] `dynamic import`(무거운 컴포넌트), `next/image` · `next/font`
- [ ] 측정 후 최적화 (`EXPLAIN ANALYZE` / Lighthouse)

---

# Citations

1. `docs/reference/00-master-checklist.md` — 마스터 체크리스트 원문
2. `docs/reference/README.md` — 참조 문서 목차 및 관통 대원칙
