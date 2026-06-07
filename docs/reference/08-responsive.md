# 08. 반응형 웹 설계

> 출처: `jabis-hr/packages/layout/src/Sidebar.jsx`, `DashboardLayout.jsx`, `Header.jsx`, `packages/ui/components/table.jsx`, `shared-pages/AttendancePage.jsx`

## 핵심 한 줄
**Tailwind 모바일 퍼스트 + 브레이크포인트(`lg`=1024 기준선). 작은 화면 먼저 짜고 `lg:`로 데스크톱 덮어쓰기.**

## 1. ⭐ 보이기/숨기기 = 반응형의 90%
```jsx
<Button className="lg:hidden">☰</Button>          // 모바일만(햄버거)
<span className="hidden md:inline-block">긴제목</span>  // 데스크톱만
<span className="md:hidden">짧은제목</span>            // 모바일만 (같은 자리 다른 내용)
<div className="px-4 md:px-6">                      // 여백도 화면 따라
```
- `hidden md:block`(모바일숨김→데스크톱표시) ↔ `md:hidden`(반대). 모바일 퍼스트: 접두사 없음=기본(모바일), `md:`=768↑ 덮어쓰기.

## 2. 사이드바: 데스크톱 고정 / 모바일 드로어 (한 컴포넌트)
```jsx
{mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={close}/>}  // 백드롭
<aside className={cn(
  'fixed left-0 z-50 transition-all duration-300',
  'hidden lg:flex top-14 h-[calc(100vh-3.5rem)]',  // 데스크톱: 헤더 아래 고정
  isExpanded ? 'lg:w-56' : 'lg:w-16',              // 펼침/접힘 너비
  mobileOpen && 'flex w-full top-0 h-full',        // 모바일: 전체 드로어
)}>
```
- z층: 백드롭 z-40 < 사이드바 z-50. 데스크톱=콘텐츠 밀기, 모바일=덮기.
- **Next.js**: shadcn `Sheet`(백드롭/포커스트랩/애니메이션 내장)로 모바일 사이드바.

## 3. 콘텐츠는 사이드바에 반응
```jsx
<main className="flex-1 overflow-y-auto transition-all duration-300 lg:ml-16 [&]:lg:ml-56(펼침시)">
```
- 모바일엔 ml 없음(오버레이). `lg:`에서만 여백. transition으로 부드럽게.

## 4. 어려운 요소
- **테이블**: `<div className="overflow-x-auto"><table/></div>`(가로 스크롤). 중요화면은 모바일=카드(`hidden sm:block` 테이블 + `sm:hidden` 카드).
- **긴 텍스트 함정**: flex 자식은 `min-w-0` 줘야 `truncate` 동작. "화면 가로 삐짐"의 주범.

## 5. 고정 셸 + 본문만 스크롤
```jsx
<div className="h-screen overflow-hidden flex flex-col">
  <Header/>                                          // 고정
  <main className="flex-1 overflow-y-auto">{...}</main>  // 본문만 스크롤
</div>
```

## 6. 🎯 AI 평가 플랫폼
- 셸: shadcn Sheet + `lg:` 고정/드로어((dashboard)/layout.tsx).
- **응시 화면 = 모바일 퍼스트**(폰 사용 많음). `grid-cols-1 lg:grid-cols-2`(문제+답안).
- 평가 대시보드: 데스크톱 테이블+모바일 카드.
- 반응형 그리드(가장 흔함):
```jsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats}</div>
```

## 체크리스트
- [x] 모바일 퍼스트, lg 기준선
- [x] hidden md:block ↔ md:hidden
- [x] 사이드바 데스크톱고정/모바일드로어(shadcn Sheet), z층
- [x] 콘텐츠 데스크톱 밀기/모바일 덮기
- [x] 테이블 overflow-x-auto 또는 모바일 카드
- [x] flex 자식 min-w-0 + truncate
- [x] h-screen 셸 + 본문 overflow-y-auto
- [x] grid-cols-1 sm:2 lg:4
- [x] 응시 플로우 모바일 퍼스트
