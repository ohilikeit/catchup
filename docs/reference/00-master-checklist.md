# 00. 마스터 체크리스트 — AI 평가 플랫폼 구축 순서

> 1~9단계(JABIS 분석)에서 추출한 것을 **실제 구축 순서**로 종합. 각 항목은 해당 문서로 연결.

## 확정 아키텍처
- **Next.js App Router 통합형**(프론트+API 한 앱), 모노레포(`apps/web` + `packages/ui,core`), **단일 PostgreSQL**(+선택적 Redis), self-host(`output:'standalone'`).
- 롤모델 = jabis-cert(통합형). 반면교사 = jabis-hr+gateway(분리형, 조직규모용).

## 관통 대원칙 5
1. **경계를 이름으로** — 패키지 분리, DB schema 분리.
2. **불변식은 DB가 강제** — NOT NULL/UNIQUE/FK/CHECK/트리거.
3. **단순함은 의도된 선택** — 분리/추상화는 요구 생길 때. 과설계 금지.
4. **패턴 > 도구** — 프레임워크 바뀌어도 설계원칙은 이식.
5. **클라이언트 입력은 적대적** — 점수·역할·소유권은 서버가 재판단.

---

## Phase 0 — 뼈대 ([01](./01-framework-monorepo.md))
- [ ] 모노레포: `apps/web` + `packages/ui` + `packages/core`, pnpm-workspace.yaml
- [ ] Next.js App Router + `transpilePackages:['@app/ui','@app/core']`
- [ ] 패키지 `"main":"./src/index.ts"`(빌드없음) + peerDeps로 react 단일화
- [ ] `output:'standalone'`, `.env.development/.production`
- [ ] API 응답 봉투 `{success,data,error}` + fetch 래퍼(core)

## Phase 1 — DB ([02](./02-db-schema.md))
- [ ] 단일 DB + schema 분리(`auth`,`exam`,`grading`)
- [ ] 공유 `set_updated_at()` 트리거 함수 1개
- [ ] 테이블: PK(UUID/TEXT/BIGSERIAL 용도별), TIMESTAMPTZ audit, 상태=CHECK
- [ ] 인덱스: FK·status·created_at DESC·복합·부분
- [ ] 강한 FK+CASCADE(도메인내) / 약한 참조(도메인간)
- [ ] `grading.jobs` 잡 큐 + `FOR UPDATE SKIP LOCKED`
- [ ] `grading.score_history` 점수 변경 이력
- [ ] 마이그레이션 도구(Prisma/Drizzle), 데이터변환은 6원칙(백업/트랜잭션/멱등)
- [ ] repository: `$1` 바인딩, 행 매퍼, RETURNING

## Phase 2 — 인증/역할/보안 ([04](./04-user-role.md) · [05](./05-security.md))
- [ ] 역할 4개: examinee/grader/author/admin, `auth.user_roles` M:N
- [ ] 인증≠인가 분리, 핸들러 래퍼에 `requireAuth`/`requireRole`
- [ ] 로그인 시 역할을 세션/JWT(jose)에 적재
- [ ] 비번 bcrypt, 시크릿 timingSafeEqual
- [ ] 세션 = httpOnly+secure+sameSite 쿠키 (localStorage 금지)
- [ ] **백엔드에서 역할 재검사**(프론트는 UX만) + 자원 소유권(행 단위)
- [ ] 출력 이스케이프(XSS), `$1`(SQLi), 로그인 실패 차단
- [ ] AI: 점수 서버계산, 프롬프트 인젝션 방어(답안 격리+출력 스키마 검증)

## Phase 3 — UI 기반 ([07](./07-design-system.md) · [08](./08-responsive.md))
- [ ] `npx shadcn init` + add (button/card/dialog/table/badge/tabs/sheet)
- [ ] 의미론적 CSS변수 토큰 + 도메인 토큰(`--score-pass/fail/partial`)
- [ ] next-themes 다크모드
- [ ] 모바일 퍼스트, 응시화면은 특히. 반응형 그리드/사이드바(Sheet)

## Phase 4 — 페이지/기능 ([06](./06-page-routing.md))
- [ ] `(dashboard)/layout.tsx` 영속 셸(역할별 메뉴 필터)
- [ ] 라우트: exams, exams/[id], grading, grading/[id], authoring
- [ ] 초기데이터=서버컴포넌트 fetch, 상호작용=zustand
- [ ] mock fallback로 백엔드 전 UI 개발, Promise.allSettled

## Phase 5 — 성능/캐시 ([03](./03-cache.md) · [09](./09-optimization.md))
- [ ] 캐시 추상화(cacheService): 처음 메모리 Map → 필요 시 Redis
- [ ] AI 채점 해시 캐싱(`ai:grade:${rubricVer}:${hash}`)
- [ ] DB 풀 전역 1개, N+1 회피, 페이지네이션
- [ ] dynamic import(무거운 컴포넌트), next/image·font
- [ ] 측정 후 최적화(EXPLAIN ANALYZE/Lighthouse)

---

## 단계별 문서
[01 프레임워크](./01-framework-monorepo.md) · [02 DB](./02-db-schema.md) · [03 캐시](./03-cache.md) · [04 역할](./04-user-role.md) · [05 보안](./05-security.md) · [06 페이지](./06-page-routing.md) · [07 디자인](./07-design-system.md) · [08 반응형](./08-responsive.md) · [09 최적화](./09-optimization.md)
