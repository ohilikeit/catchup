# 01. 프레임워크 & 모노레포 구조

> 출처: `jabis-hr`(Vite SPA + pnpm 모노레포), `jabis-api-gateway`(Fastify 레이어드), `jabis-cert`(Next.js 통합형)

## 1. 모노레포 기본형: `apps/ + packages/`

```
my-platform/
├── pnpm-workspace.yaml
├── apps/
│   └── web/            ← 실제 배포 앱 (조립자)
└── packages/
    ├── ui/             ← 디자인 시스템 (최하위, 의존성 없음)
    └── core/           ← 테마+API클라이언트+인증+공용훅
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

**원칙: 앱=조립자, 패키지=부품.** 공통 로직은 전부 packages로, 앱은 "그 앱만의 페이지 + 조립"만.

### 가져갈 것
- [x] `apps/ + packages/` 2층 구조.
- [x] **패키지는 처음에 `ui`, `core` 2개로 시작.** (JABIS는 6개지만 그건 규모 때문. 페이지 많아지면 그때 `shared-pages` 분리)
- [ ] 멀티레포(여러 저장소)는 **버림** — 나는 단일 모노레포.

## 2. ⭐ 빌드 없는 내부 패키지 (가장 중요한 트릭)

패키지를 `dist`로 빌드하지 않고 **소스를 직접 export**한다. 패키지에 빌드 스텝이 없다.

```jsonc
// packages/ui/package.json
{
  "name": "@app/ui",
  "main": "./src/index.ts",   // dist 아님! 원본 소스 직접 지정
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": { "react": "^18", "react-dom": "^18" }  // react는 앱에 1개만
}
```

- **Vite**: `optimizeDeps.include: ['@app/ui']`
- **Next.js**: `next.config`에 `transpilePackages: ['@app/ui', '@app/core']` ← 이거 한 줄로 동일 효과
- 의존성은 **단방향 비순환**: `ui ← core ← (app)`. 하위가 상위를 import하면 안 됨.
- 공유 라이브러리(react 등)는 `peerDependencies`로 — 복사본 중복 → "Invalid hook call" 방지.

### 가져갈 것
- [x] `"main": "./src/index.ts"` + 패키지 빌드 스텝 없음.
- [x] Next.js면 `transpilePackages`.
- [x] `peerDependencies`로 react/공유 패키지 단일화.
- [x] 의존성 방향 단방향 유지(순환 금지).

## 3. 조립 지점(Composition Root) & 응답 봉투

앱 진입점(`main.tsx` 또는 Next `layout.tsx`)에서 Provider를 양파처럼 중첩:
```
<ThemeProvider> → <ToastProvider> → <AuthProvider> → <App/>
```

API 응답은 **항상 표준 봉투**로 통일:
```ts
{ success: true,  data: ... }
{ success: false, error: { code, message } }
```
프론트 fetch 래퍼에서 `success`를 보고 일괄 에러 처리. 헤더 규약: `Authorization: Bearer`, 개발용 `X-Dev-Token`.

### 가져갈 것
- [x] **`{ success, data, error }` 응답 봉투** — 프론트 에러 처리 통일.
- [x] API 클라이언트(fetch 래퍼)를 `core`에 1곳으로.
- [ ] `setSharedApiClient` 같은 의존성 주입은 **앱 1개면 불필요**(여러 앱 공유 시 도입).

## 4. 빌드 모드 & 환경 분리

- `mode`별 `.env`(`.env.development`, `.env.production`, 필요시 `.env.staging`).
- Vite dev `server.proxy`로 백엔드 연결 = CORS 회피. **Next.js 통합형은 프론트·백 동일 출처라 proxy 자체가 불필요(통합의 큰 실익).**

### 가져갈 것
- [x] `mode`별 `.env`로 환경(local/staging/prod) 분리.
- [ ] Vite `ext`/`preview` 멀티모드, `base` 경로분리 → **버림**(폐쇄망/멀티앱 요구 없음).

## 5. 백엔드 레이어드 아키텍처 (프레임워크 무관)

```
요청 → [미들웨어] → route(얇게) → service(로직) → repository(SQL만) → 응답
```
- **route**: 검증 + 위임만. **service**: 비즈니스 로직. **repository**: SQL을 여기에만 가둠.
- 폴더: `config/ middleware/ routes/ services/ repositories/ schemas/ types/ utils/`
- 운영 필수: 부팅 시 DB/Redis 헬스체크, **graceful shutdown**, 모든 요청에 **requestId**.

Next.js 통합 시: `route.ts`(얇게) → `lib/*`(service+repository). `jabis-cert`가 정확히 이 구조.
Fastify 플러그인(rate-limit/helmet/검증)은 **핸들러 래퍼 1개**로 재현:
```ts
createHandler({ schema, requireAuth, handler })
// = requestId + auth + zod검증 + {success,data,error}봉투 + 통합 에러처리
```

### 가져갈 것
- [x] **route→service(lib)→repository + schemas(검증)** 레이어. SQL은 repository에만.
- [x] requestId, graceful shutdown, 부팅 헬스체크.
- [x] Zod 검증 + 핸들러 래퍼로 미들웨어 파이프라인 재현.
- [ ] OpenTelemetry/Prometheus 풀스택, 프록시 로직 → **버림/축소**.

## 핵심 결정 요약
| 항목 | 내 선택 |
|---|---|
| 빌드/번들 | Next.js(Turbopack) — Vite 불필요 |
| 백엔드 | Next API Route(`route.ts`+`lib/`) — Fastify 불필요, 패턴은 이식 |
| 패키지 | `ui`,`core` 2개 시작, `transpilePackages`, src 직접 export |
| 느린 AI 평가 | `output:'standalone'` self-host + 비동기 잡 큐 (→ 02 문서) |
