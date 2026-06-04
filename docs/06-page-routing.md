# 06. 페이지 설계 & 라우팅

> 출처: `jabis-hr/apps/hr/src/App.jsx`, `packages/layout/DashboardLayout.jsx`, `packages/shared-pages/src/pages/*`, `apps/hr/src/stores/*`
> 원본은 Vite SPA(react-router). 아래는 **Next.js App Router 번역** 포함.

## 핵심 한 줄
**Header/Sidebar는 영속 셸(한 번 렌더), 페이지만 교체. 레이아웃은 props 주입형 순수 부품. 메뉴는 중앙 배열, 라우트는 파일.**

## 1. 영속 셸 + 중첩 라우트
- SPA: `<DashboardLayout>{<Routes>...</Routes>}</DashboardLayout>` — 셸은 한 번, 안쪽만 교체.
- **Next.js**: `app/(dashboard)/layout.tsx`에 Sidebar+Header → 하위 `page.tsx`가 자동으로 `{children}`. `<Routes>` 수동나열 불필요, **폴더=라우트**.
```
app/(dashboard)/layout.tsx            # 셸
app/(dashboard)/exams/page.tsx        # /exams
app/(dashboard)/exams/[id]/page.tsx   # /exams/123  ([id]=URL파라미터)
app/login/page.tsx                    # 셸 없음
```
- `(dashboard)` = route group(URL에 안 나타남, 레이아웃 공유용).

## 2. ⭐ 레이아웃 = 설정으로 동작하는 순수 부품
```jsx
<DashboardLayout
  headerConfig={{title,subtitle,logoSrc}} menuItems={...}   // 데이터 주입
  userRole="hr" onLogout={...} onRoleChange={...} themeToggle={...}  // 동작 주입
>{children}</DashboardLayout>
```
- [x] 레이아웃에 비즈니스 로직 없음(순수 표현 + 주입 콜백) → 여러 앱/역할 재사용.
- [x] 사이드바 펼침 등 UI 상태는 sessionStorage 유지.

## 3. 메뉴 ↔ 라우트 (평행 구조, path로 연결)
- 메뉴(보이는 내비)와 라우트(path→컴포넌트)는 분리된 관심사. path 문자열로 연결.
- **Next.js**: 라우트는 파일 자동. **메뉴 배열만 중앙 관리.** 활성표시=`usePathname()`, 역할노출=`menu.filter(m => m.roles.includes(role))`.

## 4. 페이지 재사용: role prop
```jsx
<ApprovalPage role="hr" />   <ApprovalPage role="finance" />  // 같은 컴포넌트
```
- 페이지가 ui/auth/store만 의존(앱 특정 코드 없음) → 부품화.
- [x] 단일앱은 page.tsx에 직접 작성(과분리 금지). 단 **한 페이지 다역할**(examinee/grader)엔 role prop 분기 유용.

## 5. 점진 개발
- **ComingSoonPage**: 라우트/메뉴 뼈대 먼저, 페이지 나중.
- **mock fallback**: store 초기값=mock → API 준비되면 fetchAll이 교체. 프론트/백 병렬개발.
- **`Promise.allSettled`**: 독립 요청 병렬 + 하나 실패해도 나머지 유지(대시보드 위젯 한 개 장애가 전체 안 깸).

## 6. 상태관리 zustand
```js
const useStore = create((set, get) => ({
  items: [], isLoading: false, error: null,         // 상태
  fetchAll: async () => { set({isLoading:true}); ...; set({items}) },  // 액션 동거
  add: async (d) => { await apiPost(...); get().fetchAll() },
}))
const items = useStore(s => s.items)   // 선택적 구독(그 조각 변할 때만 리렌더)
```
- **Next.js App Router 전환**: 초기 데이터=**서버 컴포넌트(page.tsx)에서 fetch**(useEffect 불필요), zustand는 **클라이언트 상호작용**(필터/다이얼로그/낙관적업데이트)에만. SPA의 "전부 client+useEffect"보다 발전.

## 7. 🎯 AI 평가 플랫폼
```
app/(dashboard)/layout.tsx                       # 역할별 메뉴 필터 셸
  exams/page.tsx  exams/[id]/page.tsx            # 응시
  grading/page.tsx  grading/[submissionId]/page.tsx  # 채점(grader/admin)
  authoring/page.tsx                             # 출제(author/admin)
app/login/page.tsx
```
- 초기데이터=서버fetch, 필터/다이얼로그=zustand. 한 페이지 다역할=role 분기.

## 체크리스트
- [x] (group)/layout.tsx 영속 셸
- [x] 레이아웃 props 주입형 순수 부품
- [x] 메뉴 중앙 배열 + 역할 필터, usePathname 활성표시
- [x] 파일=라우트, [id] 파라미터
- [x] mock fallback + Promise.allSettled
- [x] 초기데이터 서버fetch / 상호작용 zustand
