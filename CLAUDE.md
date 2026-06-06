# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 이 레포지토리란

CatchUP 플랫폼 모노레포(pnpm workspaces)입니다. 현재는 **IBM Carbon** 파운데이션 위에 구축한
프로덕티브 엔터프라이즈 UI 시스템인 **CatchUP 디자인 시스템**과, 이를 보여주는 Next.js 앱이
들어 있습니다. 최종 제품은 AI 테스트 평가 플랫폼이며, 우리 서비스의 웹 플랫폼 개발 계획은
[docs/1-web-platform-planning.md](docs/1-web-platform-planning.md)에 있습니다. 그 아키텍처 결정의
**레퍼런스**(타 시니어 코드 분석 노트, 한국어)는 [docs/reference/](docs/reference/)에 정리돼 있고
[docs/reference/README.md](docs/reference/README.md)가 그 색인입니다.

## 명령어

```bash
pnpm install            # 워크스페이스 부트스트랩
pnpm dev                # apps/web 실행 (Next dev 서버) → http://localhost:3000
pnpm build              # apps/web 프로덕션 빌드
pnpm typecheck          # 모든 패키지(ui, core, web)에 tsc --noEmit
pnpm lint               # apps/web에 next lint

# 로컬 DB/캐시 (최초 1회: cp .env.example .env.secret)
pnpm db:up              # postgres + redis 컨테이너 기동 (docker compose up -d)
pnpm db:migrate         # db/migrations/*.sql 적용 (상태: pnpm db:migrate:status)
pnpm db:down            # 컨테이너 종료
```

**아직 테스트 스위트가 없습니다.** 변경 검증은 `pnpm typecheck`와 `pnpm build`로 합니다 — 빌드가
타입 체크와 전 라우트 정적 생성을 수행하므로, **빌드가 통과하면 "완료" 기준**입니다.
단일 패키지만 타입 체크하려면: `pnpm --filter @app/ui typecheck`.

## ⚠️ 프론트엔드 작업은 반드시 디자인 시스템을 따른다

**이 레포에서 UI를 만들 때는 무조건 CatchUP 디자인 시스템을 사용해야 합니다. 컴포넌트를
직접 손으로 만들거나, raw 색상·임의의 Tailwind 색상 값을 쓰지 마세요.**

- 컴포넌트는 `@app/ui`에서 import합니다 (`Button`, `Input`, `Field`, `Select`, `Checkbox`,
  `Radio`, `Toggle`, `Tag`, `Notification`, `Tile`, `Menu`, `Link`, `Icon`) — 그리고 조합형 킷
  (`AppHeader`, `SideNav`, `Modal`, `Breadcrumb`, `MetricTile`/`MetricGrid`, `DataTable`)도 마찬가지.
- 스타일링은 Tailwind preset의 **시맨틱 토큰 유틸리티만** 사용합니다 — `bg-background`,
  `bg-layer-02`, `text-text-secondary`, `border-border-subtle-01`, `text-support-error`,
  `shadow-focus-inset`, 그리고 `gap-05`/`p-07` 같은 스페이싱. **절대 금지:** `bg-blue-500`, `#hex`,
  `rounded-lg`. raw Carbon 램프(`bg-blue-60`)도 존재하지만 최후의 수단이며, 역할 토큰을 우선합니다.
- CatchUP 룩을 지킵니다 (이건 일반 shadcn이 아니라 Carbon입니다): **샤프한 모서리**(`rounded-pill`
  태그 / `rounded-sm` 외에는 border-radius 없음), 구조는 1px 보더 + 배경 단계로 그리고, 그림자는
  **떠 있는 레이어(menu/modal/toast)에만**, 강렬한 2px 블루 포커스 링, `.cds-*` 스케일의 IBM Plex
  타입, 동사 우선 문장형(sentence-case) 카피, **이모지·그라디언트·둥근 "친근한" 카드 금지**.
  상태 표현 = 채워진(filled) 아이콘 + 고정 support 4종(error/success/warning/info).
- 없는 컴포넌트가 필요하면? **`@app/ui`에 추가**하세요 (기존 패턴을 따라서) — 앱 안에 일회용으로
  만들지 마세요.
- 전체 가이드라인: [packages/ui/README.md](packages/ui/README.md).

## 아키텍처

```
apps/web        @app/web   Next.js App Router — 유일한 배포 대상; 패키지를 조립
packages/ui     @app/ui    디자인 시스템: 토큰, 아이콘, 컴포넌트   (내부 의존성 없음)
packages/core   @app/core  테마(next-themes) + 토스트              (@app/ui에 의존)
```

의존성 방향은 단방향·비순환입니다: **`ui ← core ← web`**. `@app/ui`에서 `@app/core`나 앱 코드를
import하면 안 됩니다.

**빌드 없는 내부 패키지.** `@app/ui`와 `@app/core`는 `"main": "src/index.ts"`(원본 소스 직접
지정, 빌드 스텝 없음)로 두고 React를 `peerDependency`로 둡니다(React 사본 1개 → "Invalid hook
call" 방지). 앱은 [apps/web/next.config.mjs](apps/web/next.config.mjs)의 `transpilePackages`로
이들을 컴파일합니다. 그 결과: **패키지에 파일을 추가할 때 빌드가 필요 없지만**, 앱의
`tailwind.config.ts` `content` glob이 `../../packages/*/src/**`를 계속 스캔해야 합니다 — 그렇지
않으면 패키지 내부에서 쓰는 유틸리티 클래스가 purge됩니다.

**토큰 시스템이 척추입니다** (테마가 동작하는 원리):
1. [packages/ui/src/styles/tokens.css](packages/ui/src/styles/tokens.css)가 CSS 변수를 2겹으로
   정의합니다 — raw Carbon 램프(`--blue-60`)와 **시맨틱 역할**(`--background`, `--text-primary`,
   `--layer-02`). `.dark` 블록이 시맨틱 변수를 Carbon Gray-100 값으로 다시 가리킵니다.
2. [packages/ui/tailwind-preset.js](packages/ui/tailwind-preset.js)가 Tailwind 유틸리티 → 그
   시맨틱 변수로 매핑하며, `presets: [require('@app/ui/tailwind-preset')]`로 공유됩니다.
3. 컴포넌트는 **역할 유틸리티만** 사용하므로 다크모드는 순수 토큰 스왑입니다 — `next-themes`가
   `<html>`에 `.dark`를 토글하면 **`dark:` 변형 없이** 전부 리테마됩니다.

앱은 토큰을 한 번만 import하고
(`@import '@app/ui/styles/tokens.css'` — [apps/web/app/globals.css](apps/web/app/globals.css)),
조립 지점([apps/web/app/layout.tsx](apps/web/app/layout.tsx))에서 프로바이더를 중첩합니다:
`ThemeProvider → ToastProvider → app`. `layout.tsx`의 `<html>`에는 `suppressHydrationWarning`이
필요합니다 (next-themes가 하이드레이션 전에 클래스를 설정하기 때문).

**컴포넌트 컨벤션** (`@app/ui`를 확장할 때 이대로):
- shadcn 패턴: 변형은 `cva(...)`, 들어온 `className`을 기본값 위에 병합할 땐 `cn()`
  (`twMerge(clsx())`); `forwardRef`; 링크로 렌더될 수 있는 컴포넌트는 `@radix-ui/react-slot`의
  `asChild` 사용 ([Button.tsx](packages/ui/src/components/Button.tsx) 참고).
- 브라우저 상태를 다루는 컴포넌트(`useState`, 그게 필요한 이벤트 핸들러, 포털)는 `'use client'`를
  답니다 (예: `Modal`, `DataTable`, `@app/core` 전체). 순수 표현형 컴포넌트는 서버 호환으로 둡니다.
- 아이콘은 `CARBON_ICONS`의 인라인 SVG(43개 글리프, 32-grid)이며 `currentColor`로 리컬러합니다 —
  색상은 text 유틸리티로 지정하고 `fill`/`stroke` prop을 쓰지 마세요. 이들은 충실한 재구성이며
  byte-for-byte `@carbon/icons`가 아닙니다.

## ⚠️ 데이터 레이어 (DB · 캐시) — 두 가지 철칙

단일 PostgreSQL(정보원) + 단일 Redis(보조, fail-soft). 백엔드는 통합형 Next.js: `route.ts`(얇게) →
`lib/` (service/repository), SQL은 repository에만. 근거: [02](docs/reference/02-db-schema.md)·[03](docs/reference/03-cache.md)·[01 §5](docs/reference/01-framework-monorepo.md).

- **위치**: 스키마 DDL = [db/migrations/](db/migrations/) · 러너 = [db/migrate.mjs](db/migrate.mjs) ·
  DB 코드 = [apps/web/lib/db/](apps/web/lib/db/) · 캐시 = [apps/web/lib/cache/](apps/web/lib/cache/) ·
  응답 봉투 = [apps/web/lib/http.ts](apps/web/lib/http.ts) · 로컬 인프라 = [docker-compose.yml](docker-compose.yml) ·
  시크릿 = `.env.secret`(gitignore, 템플릿은 `.env.example`).
- ⭐ **철칙 1 — 스키마 변경은 항상 `db/migrations`에 반영한다.** DB schema·table·인덱스·제약·트리거가
  바뀌면 **반드시 `db/migrations/`에 새 `00NN_*.sql`을 추가**한다(여기가 스키마의 **유일한 정의처**).
  적용된 파일은 수정 금지(append-only) — 변경은 새 파일로. 적용/검증 = `pnpm db:migrate`.
- ⭐ **철칙 2 — 개발 내내 DB 연결성을 먼저 생각한다.** 기능을 만들 때 "이 데이터가 어느 schema·table에
  있고 어떻게 연결·쿼리되는가"를 먼저 정한다. SQL은 **repository에만**(`$1` 바인딩·행 매퍼), 읽기는
  `cacheService.getOrSet`·쓰기는 invalidate를 짝으로. DB는 필수 의존성, Redis는 fail-soft.
  연결 상태는 [/api/health](apps/web/app/api/health/route.ts)로 확인.

## ⚠️ 플랫폼 작업은 반드시 docs/의 결정을 기초로 삼는다

**디자인 시스템을 넘어 제품(백엔드·DB·라우팅·인증·캐시 등)을 계획하거나 구현할 때는,
시작 전에 반드시 [docs/reference/](docs/reference/)의 해당 문서를 먼저 읽고 그 결정을 기초로 삼아야 합니다.**
docs/reference는 JABIS 분석에서 추출한 이 플랫폼의 **확정 설계 결정**이며, 임의로 다른 아키텍처를
즉흥적으로 도입하지 마세요. docs와 충돌하는 접근이 필요하다고 판단되면, 진행하기 전에 먼저
사용자에게 그 불일치를 알리고 확인을 받습니다.

- **작업 진입점**: [docs/reference/00-master-checklist.md](docs/reference/00-master-checklist.md)가 1~9단계를
  실제 구축 순서(Phase 0~)로 종합한 마스터 체크리스트입니다. 새 기능/단계를 시작하면 먼저 이
  체크리스트에서 현재 위치와 의존 단계를 확인하고, 해당 Phase가 가리키는 세부 문서로 들어갑니다.
- **주제별 매핑** (계획·구현 시 해당 문서를 근거로 인용):
  - 모노레포·프레임워크·레이어드 백엔드·`{success,data,error}` 봉투 → [01](docs/reference/01-framework-monorepo.md)
  - DB 스키마(단일 DB + schema 분리, PK/인덱스/FK/트리거) → [02](docs/reference/02-db-schema.md)
  - 캐시(Redis namespace, TTL, getOrSet, AI 채점 해시캐싱) → [03](docs/reference/03-cache.md)
  - 인증/인가(roles M:N, 프론트 UX ≠ 백엔드 보안) → [04](docs/reference/04-user-role.md)
  - 보안(bcrypt/JWT/httpOnly, XSS·SQLi, 프롬프트 인젝션) → [05](docs/reference/05-security.md)
  - 페이지 설계·라우팅(영속 셸 + 중첩 라우트, 메뉴/라우트) → [06](docs/reference/06-page-routing.md)
  - 디자인 시스템·도메인 토큰 → [07](docs/reference/07-design-system.md) (+ 위의 디자인 시스템 규칙)
  - 반응형(모바일 퍼스트, 테이블→카드, `min-w-0` 함정) → [08](docs/reference/08-responsive.md)
  - 최적화(DB 풀·N+1·페이지네이션, 측정 후 최적화) → [09](docs/reference/09-optimization.md)
- **관통 대원칙 5** (모든 결정이 따라야 함): ① 경계를 이름으로 드러낸다(패키지·DB schema 분리)
  ② 불변식은 DB가 강제한다(NOT NULL/UNIQUE/FK/CHECK/트리거) ③ 단순함은 의도된 선택 — 분리·추상화는
  요구가 생길 때만, 과설계 금지 ④ 패턴 > 도구 ⑤ 클라이언트 입력은 적대적 — 점수·역할·소유권은
  서버가 재판단한다.

요약: 통합형 Next.js App Router 앱(route handler + `lib/` service/repository 레이어), 스키마로
분리한 단일 PostgreSQL DB, `{ success, data, error }` API 응답 봉투, 색상을 하드코딩하는 대신
디자인 시스템에 추가하는 도메인 토큰(예: `score-pass`/`score-fail`).

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.
