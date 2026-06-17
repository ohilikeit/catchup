---
type: Architecture Decision
title: 페이지 설계 & 라우팅
description: Next.js App Router 영속 셸((dashboard)/layout.tsx) + 중첩 라우트. 레이아웃은 props 주입형 순수 부품. 메뉴 중앙 배열 + 역할 필터. 초기 데이터=서버 컴포넌트, 상호작용=zustand.
resource: file:///docs/reference/06-page-routing.md
tags:
  - routing
  - nextjs
  - layout
  - zustand
timestamp: 2026-06-17T00:00:00Z
---

# 페이지 설계 & 라우팅

레이아웃에서 사용하는 디자인 시스템 컴포넌트(사이드바, 헤더)는 [design-system](/platform/design-system.md),
모바일 사이드바 드로어 패턴은 [responsive](/platform/responsive.md) 참조.

## 결정 1: 영속 셸 + 중첩 라우트

Header/Sidebar는 **한 번만 렌더**되고 페이지만 교체한다.

```
app/(dashboard)/layout.tsx             # 셸 (Sidebar + Header)
app/(dashboard)/exams/page.tsx         # /exams
app/(dashboard)/exams/[id]/page.tsx    # /exams/123
app/(dashboard)/grading/page.tsx       # /grading
app/(dashboard)/grading/[id]/page.tsx  # /grading/123
app/(dashboard)/authoring/page.tsx     # /authoring
app/login/page.tsx                     # 셸 없음
```

`(dashboard)` = route group (URL에 나타나지 않음, 레이아웃 공유용).
`[id]` = URL 파라미터. 폴더=라우트이므로 `<Routes>` 수동 나열이 불필요하다.

> **구현 현황**: route group 이름이 `(dashboard)`가 아니라 **`(app)`**이다. 라우트 구조도 역할별 섹션으로 구분된다:
> ```
> app/(app)/layout.tsx                      # 셸
> app/(app)/my/exams/                       # 응시자: 내 시험 목록
> app/(app)/my/lecture/                     # 응시자: 강의
> app/(app)/my/reports/[id]/               # 응시자: 리포트
> app/(app)/org/dashboard/                  # 학교담당자: 대시보드
> app/(app)/org/students/[id]/             # 학교담당자: 학생
> app/(app)/org/batches/[id]/              # 학교담당자: 회차
> app/(app)/admin/batches/[id]/            # 관리자: 회차 운영
> app/(app)/admin/orgs/                    # 관리자: 대학
> app/(app)/admin/problems/[code]/         # 관리자: 문제
> app/(app)/admin/students/               # 관리자: 학생/계정
> app/(app)/admin/submissions/[id]/       # 관리자: 제출 검증
> app/(app)/change-password/              # 임시비번 변경
> app/(exam)/exam/[attemptId]/            # 시험 응시 (별도 셸)
> app/(marketing)/                        # 마케팅 페이지 (별도 셸)
> app/login/                              # 셸 없음
> ```
> `grading/`·`authoring/` 경로는 현재 없다. 시험 응시는 `(exam)` 별도 route group으로 분리됨.

## 결정 2: 레이아웃 = props 주입형 순수 부품

```tsx
<DashboardLayout
  headerConfig={{ title, subtitle }}
  menuItems={filteredMenu}      // 데이터 주입
  userRole="grader"
  onLogout={...}                // 동작 주입
>
  {children}
</DashboardLayout>
```

레이아웃에 비즈니스 로직이 없다(순수 표현 + 주입 콜백) → 여러 역할에서 재사용 가능.
사이드바 펼침 등 UI 상태는 sessionStorage로 유지한다.

## 결정 3: 메뉴 ↔ 라우트 분리 (path로 연결)

메뉴(보이는 내비)와 라우트(path→컴포넌트)는 분리된 관심사이다. path 문자열로 연결한다.

- **라우트**: 파일 자동.
- **메뉴 배열**: 중앙 관리. 역할 필터: `menu.filter(m => m.roles.includes(role))`.
- **활성 표시**: `usePathname()`.

역할 필터는 UX 목적이며 보안이 아니다 — 백엔드에서 역할을 재검사한다([auth-roles](/platform/auth-roles.md) 참조).

## 결정 4: 초기 데이터 = 서버 컴포넌트, 상호작용 = zustand

```tsx
// page.tsx (서버 컴포넌트) — useEffect 불필요
const exams = await examService.list(user.id);
return <ExamList initialData={exams} />;
```

```ts
// ExamList.tsx (클라이언트 컴포넌트) — 상호작용만
const useExamStore = create((set, get) => ({
  items: [], isLoading: false,
  filter: async (q) => { set({ isLoading: true }); /* ... */ },
}));
const items = useExamStore(s => s.items);  // 선택적 구독 (그 조각 변할 때만 리렌더)
```

SPA의 "전부 client + useEffect"보다 발전된 패턴 — 서버에서 받은 초기 데이터를 hydration하고,
이후 필터·다이얼로그·낙관적 업데이트만 zustand가 처리한다.

> **구현 현황**: zustand가 `package.json`에 없고 실제 코드에서도 사용되지 않는다. 서버 컴포넌트에서 초기 데이터를 fetch하는 패턴은 구현되어 있으나, 클라이언트 상태 관리에 zustand는 **미도입** 상태다.

## 결정 5: 점진 개발 패턴

- **ComingSoonPage**: 라우트/메뉴 뼈대를 먼저 두고 페이지는 나중에 채운다.
- **mock fallback**: store 초기값=mock → API 준비되면 `fetchAll`이 교체. 프론트/백 병렬 개발.
- **`Promise.allSettled`**: 독립 요청 병렬 + 하나 실패해도 나머지 유지. 대시보드 위젯 하나의 장애가 전체를 깨지 않는다.

## 결정 6: 한 페이지 다역할 = role prop 분기

```tsx
<GradingPage role="grader" />   // 평가자 뷰
<GradingPage role="admin" />    // 관리자 뷰 (추가 컨트롤 포함)
```

단일 앱에서 페이지를 직접 작성하는 것이 기본(과분리 금지).
단, 한 페이지를 여러 역할이 쓰는 경우 role prop 분기가 유용하다.

## AI 평가 플랫폼 라우트 구조

> **구현 현황**: 아래는 실제 `apps/web/app/` 구조다. 설계의 `(dashboard)`·`grading`·`authoring` 경로는 없고, 역할별 섹션(`my/`, `org/`, `admin/`)으로 분리되어 있다.

```
app/(app)/layout.tsx                       # 역할별 메뉴 필터 셸
  my/exams/                                # 응시자: 내 시험 목록
  my/lecture/                              # 응시자: 강의
  my/reports/[id]/                         # 응시자: 리포트
  org/dashboard/                           # 학교담당자: 대시보드
  org/students/[id]/                       # 학교담당자: 학생
  org/batches/[id]/                        # 학교담당자: 회차
  admin/batches/[id]/                      # 관리자: 회차 운영
  admin/orgs/                              # 관리자: 대학(고객사)
  admin/problems/[code]/                   # 관리자: 문제·버전
  admin/students/                          # 관리자: 학생/계정
  admin/submissions/[id]/                  # 관리자: 제출 검증
  change-password/                         # 임시비번 변경
app/(exam)/exam/[attemptId]/               # 시험 응시 (전용 셸, 별도 route group)
app/(marketing)/                           # 마케팅 페이지
app/login/
```

# Citations

1. `docs/reference/06-page-routing.md` — 페이지 설계 & 라우팅 원문
2. `docs/reference/04-user-role.md` — 역할별 메뉴 필터, 백엔드 역할 검사
3. `docs/reference/07-design-system.md` — 레이아웃 컴포넌트, `'use client'` 규칙
4. `docs/reference/08-responsive.md` — 모바일 사이드바 드로어
