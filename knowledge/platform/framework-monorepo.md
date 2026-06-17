---
type: Architecture Decision
title: 프레임워크 & 모노레포 구조
description: Next.js App Router 통합형 + pnpm 모노레포(apps/packages 2층) + 빌드 없는 내부 패키지 + 레이어드 백엔드 구조에 대한 확정 결정.
resource: file:///docs/reference/01-framework-monorepo.md
tags:
  - monorepo
  - nextjs
  - architecture
  - backend-layers
timestamp: 2026-06-17T00:00:00Z
---

# 프레임워크 & 모노레포 구조

## 결정: Next.js App Router 통합형

프론트엔드와 API를 **한 앱**(`apps/web`)으로 통합한다. 롤모델은 jabis-cert(통합형).
jabis-hr+gateway(분리형, SPA + Fastify 게이트웨이)는 조직 규모 요구용으로 현재 불필요하며
반면교사로만 참조한다.

통합형의 핵심 이점: 프론트·백이 동일 출처이므로 **CORS 프록시 자체가 불필요**하고,
Next.js `route.ts`가 Fastify 플러그인 역할을 대체한다.

## 모노레포 구조

```
my-platform/
├── pnpm-workspace.yaml
├── apps/
│   └── web/            ← 실제 배포 앱 (조립자)
└── packages/
    ├── ui/             ← 디자인 시스템 (최하위, 외부 의존성 없음)
    └── core/           ← 테마 + API 클라이언트 + 공용 훅
```

원칙: **앱=조립자, 패키지=부품.** 공통 로직은 전부 `packages/`로, 앱은 "그 앱만의 페이지+조립"만.
패키지는 `ui`, `core` 2개로 시작한다(JABIS는 규모 때문에 6개이지만, 우리는 페이지가 많아질 때 분리).

의존성 방향은 **단방향 비순환**: `ui ← core ← web`. `@app/ui`가 `@app/core`나 앱 코드를 import하면 안 된다.

[design-system](/platform/design-system.md)의 컴포넌트 컨벤션은 이 패키지 구조 위에서 동작한다.

## 빌드 없는 내부 패키지

패키지를 `dist`로 컴파일하지 않고 **소스를 직접 export**한다.

```jsonc
// packages/ui/package.json
{
  "name": "@app/ui",
  "main": "./src/index.ts",       // dist 아님! 원본 소스 직접 지정
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": { "react": "^18", "react-dom": "^18" }
}
```

Next.js 앱은 `next.config.mjs`에 `transpilePackages: ['@app/ui', '@app/core']` 한 줄로 컴파일을 위임한다.
공유 라이브러리(react 등)는 `peerDependencies`로 — 복사본 중복이 "Invalid hook call"을 유발하기 때문.

주의: `apps/web/tailwind.config.ts`의 `content` glob이 `../../packages/*/src/**`를 스캔해야
패키지 내부에서 쓰는 유틸리티 클래스가 purge되지 않는다.

## 조립 지점(Composition Root)

앱 진입점(`apps/web/app/layout.tsx`)에서 Provider를 양파처럼 중첩한다:

```
ThemeProvider → ToastProvider → app
```

## API 응답 봉투

모든 API 응답은 **표준 봉투**로 통일한다:

```ts
{ success: true, data: ... }
{ success: false, error: { code, message } }
```

프론트 fetch 래퍼는 `success`를 보고 일괄 에러 처리한다. 이 래퍼는 `@app/core`에 1곳으로 둔다.
API 클라이언트의 의존성 주입(`setSharedApiClient`)은 앱이 1개이므로 불필요하다 — 여러 앱 공유 시 도입.

> **구현 현황**: `apps/web/lib/http.ts`에 `ok()`/`fail()` 헬퍼와 `ApiEnvelope<T>` 타입이 구현되어 있다.
> 봉투 형식이 `{ success: true, data }` / `{ success: false, error: { code, message } }`로 확인됨.
> 단, `@app/core`에 프론트 fetch 래퍼는 **미구현** — `packages/core/src/`에 API 클라이언트 코드가 없다(theme·toast만 존재).

## 백엔드 레이어드 아키텍처

```
요청 → [미들웨어] → route(얇게) → service(로직) → repository(SQL만) → 응답
```

Next.js 통합 시: `route.ts`(얇게) → `lib/*`(service + repository). SQL은 **repository에만** 가둔다.

핸들러 래퍼 1개로 Fastify 플러그인 파이프라인을 재현한다:

```ts
createHandler({ schema, requireAuth, handler })
// = requestId + auth + zod검증 + {success,data,error}봉투 + 통합 에러처리
```

> **구현 현황: `createHandler` 래퍼 미구현.** 실제 `route.ts` 핸들러는 `ok()`/`fail()`을 직접 호출하는 얇은 함수 방식으로 구현되어 있다. 인증은 `apps/web/lib/auth/guard.ts`의 `requireSession()` / `requireAudience()` / `requireGlobalRole()`을 route 또는 서버 컴포넌트에서 직접 호출한다. 래퍼 패턴은 설계 결정으로 남아 있으나 현재 코드에는 없다.

인증/역할 검사 세부는 [auth-roles](/platform/auth-roles.md), 보안 레이어 파이프라인은 [security](/platform/security.md) 참조.

## 환경 분리

모드별 `.env`(`.env.development`, `.env.production`, 필요 시 `.env.staging`)로 환경을 분리한다.
Vite `ext`/`preview` 멀티모드와 `base` 경로 분리는 폐쇄망/멀티앱 요구가 없으므로 버린다.

## 핵심 결정 요약

| 항목 | 선택 |
|---|---|
| 빌드/번들 | Next.js (Turbopack) — Vite 불필요 |
| 백엔드 | Next API Route(`route.ts` + `lib/`) — Fastify 불필요, 패턴은 이식 |
| 패키지 | `ui`, `core` 2개 시작, `transpilePackages`, src 직접 export |
| 느린 AI 평가 | `output: 'standalone'` self-host + 비동기 잡 큐 |

> **구현 현황**: `output: 'standalone'`은 `next.config.mjs`에 **미설정**. `transpilePackages: ['@app/ui', '@app/core']`는 확인됨.

느린 AI 평가를 위한 비동기 잡 큐 구현은 [db-schema](/platform/db-schema.md)의 `grading.jobs` 참조.

# Citations

1. `docs/reference/01-framework-monorepo.md` — 프레임워크 & 모노레포 원문
2. `docs/reference/00-master-checklist.md` — Phase 0 뼈대 체크리스트
