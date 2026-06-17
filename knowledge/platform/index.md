# Platform Knowledge

JABIS 분석에서 추출한 AI 평가 플랫폼의 확정 설계 결정 모음.
각 문서는 "왜 이 구조를 택했는가"를 담는다.

- [master-checklist](./master-checklist.md) - JABIS 분석에서 추출한 실제 구축 순서 — Phase 0(뼈대)부터 Phase 5(성능/캐시)까지 단계별 체크리스트.
- [framework-monorepo](./framework-monorepo.md) - Next.js App Router 통합형 + pnpm 모노레포(apps/packages 2층) + 빌드 없는 내부 패키지 + 레이어드 백엔드 구조에 대한 확정 결정.
- [db-schema](./db-schema.md) - 단일 PostgreSQL + 도메인별 schema 분리, PK 용도별 선택, audit 트리거, JSONB 규칙, 인덱스 5원칙, FK 경계 전략, 비동기 잡 큐, 마이그레이션 6원칙.
- [cache](./cache.md) - Redis 1개를 키 prefix(namespace)로 나눠 캐시·rate-limit·카운터를 처리. 처음엔 메모리 Map으로 시작하고 필요 시 Redis로 교체. 캐시는 절대 장애 원인이 되면 안 된다(fail-soft).
- [auth-roles](./auth-roles.md) - 인증(누구냐)과 인가(뭘 할 수 있냐)를 분리된 미들웨어로 처리. 역할 4개(examinee/grader/author/admin)를 세션/JWT에 적재. 프론트=UX, 백엔드=보안. RBAC + 자원 소유권(행 단위) 혼합.
- [security](./security.md) - 여러 겹의 방어 — bcrypt/JWT/httpOnly 쿠키, XSS·SQLi 방어, 행동 기반 IP 차단, AI 평가 특화 위협(점수 조작·프롬프트 인젝션·IDOR) 대응.
- [page-routing](./page-routing.md) - Next.js App Router 영속 셸((dashboard)/layout.tsx) + 중첩 라우트. 레이아웃은 props 주입형 순수 부품. 메뉴 중앙 배열 + 역할 필터. 초기 데이터=서버 컴포넌트, 상호작용=zustand.
- [design-system](./design-system.md) - 엔지니어링 패턴은 shadcn(Radix Slot + CVA + cn), 디자인 언어는 IBM Carbon(2겹 토큰 + IBM Plex + 샤프 모서리 + 2px 포커스). @app/ui에 소유형 소스로 직접 구현.
- [responsive](./responsive.md) - Tailwind 모바일 퍼스트 + lg(1024px) 기준선. 사이드바는 데스크톱 고정/모바일 드로어(Sheet). 테이블은 모바일에서 카드로 전환. flex 자식 min-w-0 함정 주의.
- [optimization](./optimization.md) - 측정 후 병목만 수정(조기 최적화 금지). DB 풀 전역 1개, N+1 회피, 페이지네이션. Next.js 자동 코드스플리팅 + dynamic import. AI 평가는 잡 큐로 비동기 분리.
