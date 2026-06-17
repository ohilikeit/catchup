---
type: Design Principle
title: 반응형 웹 설계
description: Tailwind 모바일 퍼스트 + lg(1024px) 기준선. 사이드바는 데스크톱 고정/모바일 드로어(Sheet). 테이블은 모바일에서 카드로 전환. flex 자식 min-w-0 함정 주의.
resource: file:///docs/reference/08-responsive.md
tags:
  - responsive
  - mobile-first
  - tailwind
  - layout
timestamp: 2026-06-17T00:00:00Z
---

# 반응형 웹 설계

레이아웃 셸 구조는 [page-routing](/platform/page-routing.md),
사이드바에 쓰이는 디자인 시스템 컴포넌트는 [design-system](/platform/design-system.md) 참조.

## 핵심 결정: 모바일 퍼스트

**작은 화면 먼저 짜고 `lg:`(1024px)로 데스크톱을 덮어쓴다.**

```
접두사 없음 = 기본 (모바일)
md:          = 768px 이상
lg:          = 1024px 이상 (주 기준선)
```

AI 평가 플랫폼은 응시자가 외부/폰 접속이 많으므로 응시 화면은 **특히** 모바일 퍼스트.

## 결정 1: 보이기/숨기기 = 반응형의 90%

```jsx
<Button className="lg:hidden">☰</Button>           // 모바일만 (햄버거)
<span className="hidden md:inline-block">긴 제목</span>  // 데스크톱만
<span className="md:hidden">짧은 제목</span>             // 모바일만
```

`hidden md:block` ↔ `md:hidden` 두 패턴이 핵심이다.

## 결정 2: 사이드바 — 데스크톱 고정 / 모바일 드로어 (한 컴포넌트)

```tsx
// 데스크톱: 헤더 아래 고정 사이드바
// 모바일: Sheet(전체 드로어)로 전환
<aside className={cn(
  'fixed left-0 z-50 transition-all duration-300',
  'hidden lg:flex top-14 h-[calc(100vh-3.5rem)]',
  isExpanded ? 'lg:w-56' : 'lg:w-16',
  mobileOpen && 'flex w-full top-0 h-full',         // 모바일 드로어
)}>
```

z 층위: 백드롭 z-40 < 사이드바 z-50.
**데스크톱**: 콘텐츠를 밀어낸다 (`lg:ml-16` / `lg:ml-56`).
**모바일**: 위에 덮는다 (콘텐츠에 margin 없음).

Next.js에서는 shadcn `Sheet`(백드롭/포커스 트랩/애니메이션 내장)로 모바일 사이드바를 구현한다.

## 결정 3: 고정 셸 + 본문만 스크롤

```tsx
<div className="h-screen overflow-hidden flex flex-col">
  <Header />                                              // 고정
  <main className="flex-1 overflow-y-auto">{children}</main>  // 본문만 스크롤
</div>
```

## 결정 4: 테이블 — overflow-x-auto 또는 모바일 카드

```tsx
// 기본: 가로 스크롤
<div className="overflow-x-auto"><table /></div>

// 중요 화면: 모바일=카드, 데스크톱=테이블
<table className="hidden sm:block" />
<div className="sm:hidden">{/* 카드 뷰 */}</div>
```

평가 대시보드는 데스크톱 테이블 + 모바일 카드 패턴을 적용한다.

## 결정 5: min-w-0 함정 — flex 자식 truncate

```tsx
// 틀림: flex 자식에 min-w-0 없으면 truncate 안 됨 (화면 삐짐)
<div className="flex">
  <span className="truncate">{longText}</span>   // 동작 안 함
</div>

// 맞음
<div className="flex">
  <span className="min-w-0 truncate">{longText}</span>
</div>
```

"화면 가로 삐짐"의 주범. flex 자식에 `truncate`를 쓸 때 반드시 `min-w-0`을 같이 준다.

## 결정 6: 반응형 그리드

```tsx
// 통계 카드, 시험 목록 등
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {stats}
</div>

// 응시 화면: 문제 + 답안 2칸
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <QuestionPanel />
  <AnswerPanel />
</div>
```

# Citations

1. `docs/reference/08-responsive.md` — 반응형 웹 설계 원문
2. `docs/reference/06-page-routing.md` — 영속 셸 구조, shadcn Sheet
3. `docs/reference/07-design-system.md` — 토큰 기반 스타일링
