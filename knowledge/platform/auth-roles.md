---
type: Architecture Decision
title: 인증/인가 & 역할 설계
description: 인증(누구냐)과 인가(뭘 할 수 있냐)를 분리된 미들웨어로 처리. 역할 4개(examinee/grader/author/admin)를 세션/JWT에 적재. 프론트=UX, 백엔드=보안. RBAC + 자원 소유권(행 단위) 혼합.
resource: file:///docs/reference/04-user-role.md
tags:
  - auth
  - rbac
  - roles
  - security
timestamp: 2026-06-17T00:00:00Z
---

# 인증/인가 & 역할 설계

인증/인가는 [security](/platform/security.md)와 밀접하게 연결된다.
역할 검사가 실패할 경우의 공격 시나리오는 security 문서에서 다룬다.
역할 데이터의 DB 구조는 [db-schema](/platform/db-schema.md)의 M:N 조인 테이블 패턴을 따른다.

## 핵심 결정: 인증 ≠ 인가 (분리)

```
요청 → [authValidator: 너 누구냐]  → request.user = { id, roles[], ... }
     → [permissionChecker: 뭘 해도 되냐] → 역할/권한 검사 → 통과 시 라우트
```

한 함수에 섞지 않는다. 순서는 **싼 검사(IP 차단) 먼저, 비싼 검사(권한 DB 조회) 뒤**.

## 결정 1: 역할은 배열, 세션/JWT에 적재

```ts
export const ROLES = ['examinee', 'grader', 'author', 'admin'] as const
```

- roles는 **배열** — 한 사람이 여러 역할을 가질 수 있다.
- DB: `auth.user_roles(user_id, role)` 복합키 M:N 테이블.
- 로그인 시 DB에서 역할을 읽어 **세션/JWT에 적재** → 매 요청 DB 조회 회피.

⚠️ 토큰에 역할을 실으면 변경이 만료 전까지는 반영되지 않는다 → 토큰 TTL을 짧게 유지하고
민감 변경 시 재발급한다. JWT 서명/만료 구현 세부는 [security](/platform/security.md) 참조.

> **구현 현황**: 역할 모델이 설계와 다르게 **두 층으로 분리**되어 있다.
>
> - **GlobalRole** (`'admin' | 'author' | 'grader'`): `auth.user_roles`에 저장, 사내 인원 전용.
> - **OrgRole** (`'examinee' | 'org_admin'`): `auth.org_members.org_role`에 저장, org 단위 부여.
>
> `examinee`는 `auth.user_roles`에 없다. 세션에는 `globalRoles: GlobalRole[]`과 `orgs: { orgId, orgRole, orgName }[]`가 함께 실린다(`apps/web/lib/auth/session.ts`의 `Session` 타입). 세션 서명은 **JWT(jose) 아님** — HMAC-SHA256 커스텀 쿠키 방식 사용. TTL 기반 만료 없이 maxAge 8시간 쿠키.

## 결정 2: 역할 정의 중앙 관리 (단일 출처)

```ts
export const ROLES = ['examinee','grader','author','admin'] as const   // id (불변, 영문)
export const roleLabels = { examinee: '응시자', grader: '평가자', ... } // 라벨 (UI 표시용)
export const ROLE_HOME = { admin: '/admin', examinee: '/exams', ... }  // 역할별 기본 랜딩
```

id(영문, 불변)와 라벨(한글, UI)을 분리한다. 한 파일(`packages/core` 또는 `apps/web/lib/roles.ts`)에 모아 단일 출처로 관리한다.

> **구현 현황**: `apps/web/lib/auth/roles.ts`에 중앙 관리됨. 구체적으로는 `ROLE_LABELS`, `ROLE_HOME`, `NAV_ITEMS`, `audiencesOf()`, `navFor()`, `homeFor()` 함수를 포함한다. 랜딩 경로는 `{ admin: '/admin/batches', org_admin: '/org/dashboard', examinee: '/my/exams' }` — 설계 예시의 `/admin`, `/exams`와 다르다. `packages/core`가 아닌 `apps/web` 내부에 위치한다.

## 결정 3: RBAC(역할) + ABAC(자원 소유권) 혼합

역할만으로는 부족하다: `grader`라도 "**이 시험에 배정된** 평가자"인지 행 단위 확인이 필요하다.

```ts
// service 레이어에서 소유권 체크
await db.query(
  'SELECT 1 FROM exam.test_graders WHERE test_id = $1 AND grader_id = $2',
  [testId, user.id]
);
```

역할 체크 후 자원 소유권 체크를 service 레이어가 책임진다.

## 결정 4: RBAC로 시작, permission 테이블은 요구 생길 때

| | 역할(role) | 세분 권한(permission) |
|---|---|---|
| 단위 | 넓은 구역(메뉴/페이지) | 개별 기능/버튼 |
| 언제 도입 | 항상 | 세밀한 통제가 **실제로** 필요할 때 |

역할 4~5개로 시작한다. `permissions`/`user_permissions` 테이블은 과설계 — 요구 생기면 추가.

## 결정 5: 핸들러 래퍼에 통합 (Next.js)

```ts
export const POST = createHandler({
  requireAuth: true,
  requireRole: ['author', 'admin'],
  schema: CreateTestSchema,
  handler: ({ body, user }) => testService.create(user.id, body),
})
```

[framework-monorepo](/platform/framework-monorepo.md)의 핸들러 래퍼가 인증/인가를 자동으로 처리한다.

> **구현 현황: `createHandler` 미구현.** 실제로는 `apps/web/lib/auth/guard.ts`의 함수(`requireSession`, `requireAudience`, `requireGlobalRole`, `requireOrgAccess`)를 route handler 또는 서버 컴포넌트에서 직접 호출하는 방식으로 구현되어 있다.

## 결정 6: 프론트 게이팅은 UX, 백엔드 검사가 보안

```
프론트 hasRole('admin') === false → 메뉴 숨김 (편의/UX)
백엔드 permissionChecker           → /api/admin/* 실제 차단 (보안)
```

**모든 보호된 엔드포인트는 백엔드에서 역할/권한 재검사.** 프론트 코드는 조작 가능하다.
역할별 메뉴 필터 구현은 [page-routing](/platform/page-routing.md) 참조.

## 결정 7: 사람 vs 기계 인가 모델

- **사람 사용자**: 역할 명시적 부여. 권한 없으면 즉시 명확히 거부.
- **기계 클라이언트(API)**: "call-first, approve-later" — 권한 없으면 `pending` 자동생성, 관리자 후승인. 사람 역할에는 쓰지 말 것.

# Citations

1. `docs/reference/04-user-role.md` — User Role 설계 원문
2. `docs/reference/02-db-schema.md` — auth.user_roles M:N 테이블, test_graders 소유권
3. `docs/reference/05-security.md` — JWT 서명, httpOnly 쿠키, IP 차단
4. `docs/reference/00-master-checklist.md` — Phase 2 인증/역할/보안 체크리스트
