# 04. User Role 설계 (인증 → 인가)

> 출처: `jabis-api-gateway/src/middleware/authValidator.ts`(인증), `permissionChecker.ts`(인가), `services/permissionService.ts`, `jabis-hr/packages/auth/src/authStore.js`, `jabis-hr/packages/menu/src/roles.js`

## 핵심 한 줄
**인증(누구냐)과 인가(뭘 할 수 있냐)는 별개 미들웨어. 역할은 토큰/세션 claim으로 나른다. 프론트 게이팅=UX, 백엔드 검사=보안(둘 다 필수).**

## 1. 인증 ≠ 인가 (분리)
```
요청 → [authValidator: 너 누구냐]  → request.user = { id, roles[], ... }
     → [permissionChecker: 뭘 해도 되냐] → 역할/권한 검사 → 통과 시 라우트
```
- authValidator: IP차단 → (비운영)dev-token → Bearer 추출 → 토큰검증 → user 첨부.
- permissionChecker: 엔드포인트 매칭 → authRequired? → 권한 → rate-limit → quota.
- [x] 인증과 인가를 한 함수에 섞지 말 것. 순서는 **싼 검사(IP) 먼저, 비싼 검사(권한 DB) 뒤.**

## 2. 역할은 토큰/세션 claim
```js
getUserRoles: () => Array.isArray(user?.roles) ? user.roles : [],   // ★ 배열(다중역할)
hasRole: (role) => roles.includes(role) || roles.includes('superadmin'),  // superadmin 만능
```
- [x] roles는 **배열**(한 사람이 여러 역할). DB는 `user_roles(user_id, role)` 복합키 M:N(→ 02 문서).
- [x] 로그인 시 DB에서 역할 읽어 **세션/JWT에 적재** → 매 요청 DB조회 회피.
- ⚠️ 토큰에 역할을 실으면 변경이 만료 전까진 반영 안 됨 → 토큰 TTL 짧게 + 민감변경 시 재발급.
- ⚠️ `superadmin` 만능은 백도어 → 최소화 + 행동을 **감사로그**에 기록.

## 3. RBAC(역할) vs 세분 권한(permission)
| | 역할(role) | 세분 권한(permission) |
|---|---|---|
| 단위 | 넓은 구역(메뉴/페이지) | 개별 기능/버튼 |
| 테이블 | `user_roles` | `permissions`(parent_id 계층) + `user_permissions` |
| 언제 | 항상 | 세밀한 통제가 **실제로** 필요할 때 |
- [x] **역할 4~5개로 시작.** permission 테이블은 과설계 — 요구 생기면 추가.

## 4. 역할 정의 중앙 관리
```ts
export const ROLES = ['examinee','grader','author','admin'] as const  // id(코드)
export const roleLabels = { examinee:'응시자', ... }                   // 라벨(표시) — id와 분리
export const ROLE_HOME = { admin:'/admin', examinee:'/exams', ... }   // 역할별 기본 랜딩
```
- [x] id(영문, 불변) ↔ 라벨(한글, UI) 분리. 한 파일(`core/roles.ts`)에 모아 단일 출처.

## 5. ⭐ 프론트 게이팅은 보안이 아니다 (defense in depth)
```
프론트 hasRole('admin')===false → 메뉴 숨김 (편의/UX)
백엔드 permissionChecker         → /api/admin/* 실제 차단 (보안)
```
- [x] **모든 보호된 엔드포인트는 백엔드에서 역할/권한 재검사.** 프론트 코드는 조작 가능.
- 한 줄 원칙: **"프론트는 UX, 백엔드는 보안."**

## 6. 사람 vs 기계 인가 모델
- 사람 사용자: 역할 **명시적 부여**. 권한 없으면 즉시 명확히 거부.
- 기계 클라이언트(API): "call-first, approve-later" — 권한 없으면 `pending` 자동생성, 관리자 후승인. 기본은 차단(pending=거부)이라 안전. **사람 역할엔 쓰지 말 것.**

## 7. 🎯 AI 평가 플랫폼 적용
```ts
// 역할: examinee(응시자) / grader(채점자) / author(출제자) / admin(관리자)
// DB: auth.users + auth.user_roles(user_id, role) 복합키 M:N

// 백엔드 가드 (01 문서의 핸들러 래퍼에 통합)
export const POST = createHandler({
  requireAuth: true, requireRole: ['author','admin'], schema: CreateTestSchema,
  handler: ({ body, user }) => testService.create(user.id, body),
})
```
### ⭐ 역할(전역) vs 자원 소유권(행 단위)
- 역할만으론 부족: `grader`라도 "**이 시험에 배정된** 채점자"인지 행 단위 확인 필요.
- service 레이어에서 `test_graders`(02 문서) 조회로 소유권 체크: `WHERE test_id IN (내 배정 시험)`.
- = RBAC(역할) + ABAC(자원기반) 혼합.

## 체크리스트
- [x] 인증/인가 미들웨어 분리, 검사 순서 싼것→비싼것
- [x] roles 배열 + user_roles M:N, 세션/JWT에 적재
- [x] 역할 중앙정의(id↔라벨 분리), 역할 4~5개로 시작
- [x] 백엔드 역할 가드 필수(프론트는 UX만), superadmin 감사로그
- [x] 자원 소유권은 service에서 행 단위 추가 검사
