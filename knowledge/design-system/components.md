---
type: Component Library
title: "@app/ui 컴포넌트 카탈로그"
description: CatchUP 디자인 시스템의 전체 export 목록 — 프리미티브 12종과 콘솔 킷 6종, 그리고 컴포넌트 구현 컨벤션.
resource: file:///packages/ui/src/index.ts
tags: [components, carbon, cva, forwardRef, asChild, icons]
timestamp: 2026-06-17T00:00:00Z
---

# @app/ui 컴포넌트 카탈로그

모든 컴포넌트는 `import { Button, Field, … } from '@app/ui'`로 사용한다. 없는 컴포넌트가 필요하면 앱 내부에 일회용으로 만들지 않고 **`@app/ui`에 기존 패턴을 따라 추가**한다.

## 프리미티브 (`src/components/`)

| 컴포넌트 | 목적 |
|----------|------|
| `Button` | 기본 액션 버튼. `kind`: `primary / secondary / tertiary / ghost / danger`. `size`: `sm / field / lg`. `asChild` 지원(링크 렌더). |
| `Field` | 레이블 + 헬퍼 텍스트 + 에러 메시지를 묶는 폼 필드 래퍼. |
| `Input` | 단일 라인 텍스트 인풋. |
| `Select` | 네이티브 `<select>` 기반 드롭다운. |
| `Checkbox` | 체크박스 인풋 + 레이블. |
| `Radio` | 라디오 버튼 인풋 + 레이블. |
| `Toggle` | 온/오프 토글 스위치. |
| `Tag` | 인라인 레이블 칩. `rounded-pill` 적용. `tagVariants` export. |
| `Notification` | 인라인 / 토스트 알림 배너. `kind`: error / success / warning / info. `notifVariants` export. |
| `Tile` | 콘텐츠 카드 컨테이너. |
| `Menu` | 드롭다운 메뉴. `MenuItem` 타입 export. |
| `Link` | 텍스트 링크. `--link-primary` / `--link-visited` 토큰 사용. |

## 콘솔 킷 (`src/kit/`)

조합형 콘솔 피스 — 앱 셸과 복합 인터페이스.

| 컴포넌트 | 목적 |
|----------|------|
| `AppHeader` | 상단 앱 헤더. `--shell-*` 토큰으로 항상 짙은 크롬. |
| `SideNav` | 왼쪽 사이드 내비게이션. `SideNavItem` 타입 export. |
| `Modal` | `fixed` 포지션 오버레이 모달 다이얼로그. `'use client'` 컴포넌트. |
| `Breadcrumb` | 경로 탐색 컴포넌트. `Crumb` 타입 export. |
| `MetricTile` / `MetricGrid` | 단일 지표 타일과 그리드 레이아웃. |
| `DataTable` | 정렬·페이지네이션 지원 데이터 테이블. `Column` 타입 export. `'use client'` 컴포넌트. |

## 유틸리티 & 아이콘

| export | 목적 |
|--------|------|
| `cn` | `twMerge(clsx(...))` — 클래스 병합 기반 유틸. |
| `Icon` | Carbon 32-grid 인라인 SVG 아이콘 렌더러. `name` prop으로 글리프 지정. |
| `CARBON_ICONS` | 43개 글리프 경로 맵. |
| `STATUS_ICON` | 상태별 아이콘 이름 맵 (`error--filled` 등). |
| `IconName` | 허용 아이콘 이름 유니온 타입. |
| `StatusKind` | 허용 상태 종류 유니온 타입. |

## 컴포넌트 구현 컨벤션

새 컴포넌트를 `@app/ui`에 추가할 때 아래 패턴을 따른다.

### CVA + cn

변형(variants)은 `cva()`로 선언하고, 들어온 `className`은 `cn()`으로 기본값 위에 병합한다.

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'focus-visible:outline-none focus-visible:shadow-focus-inset …',
  {
    variants: {
      kind: { primary: 'bg-button-primary text-text-on-color', … },
      size: { sm: 'h-control-sm', md: 'h-control-md', lg: 'h-control-lg' },
    },
    defaultVariants: { kind: 'primary', size: 'lg' },
  }
);

// 사용 측에서 className override 가능
<Button kind="secondary" className="w-full" />
```

### forwardRef

DOM 요소를 직접 렌더하는 프리미티브는 `forwardRef`를 적용한다. 실제로 적용된 컴포넌트: `Button`, `Input`, `Select`, `Checkbox`, `Radio`, `Toggle`, `Link`.

`Tag`, `Field`, `Notification`, `Tile`, `Menu` 및 킷 컴포넌트(`Modal`, `DataTable` 등)는 `forwardRef`를 사용하지 않는다.

```tsx
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, kind, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ kind, size }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';
```

### asChild / Radix Slot

링크나 다른 요소로 렌더해야 할 때 `asChild` + `@radix-ui/react-slot`의 `Slot`을 사용한다. 시맨틱 HTML을 유지하면서 버튼 스타일을 합성할 수 있다.

```tsx
import { Slot } from '@radix-ui/react-slot';

// 버튼 스타일로 렌더되지만 실제 DOM은 <a>
<Button asChild>
  <a href="/dashboard">대시보드</a>
</Button>
```

### 'use client' 규칙

| 컴포넌트 유형 | 지시어 |
|--------------|--------|
| `useState`, 이벤트 핸들러, 포털이 필요한 컴포넌트 | `'use client'` 필수 |
| 순수 표현형(presentational) 컴포넌트 | 서버 호환 — 지시어 없음 |

`Modal`, `DataTable` 등 상호작용 킷은 `'use client'`를 달고, `Button`, `Tag`, `Notification` 등 표현형은 달지 않는다.

### 아이콘 사용

아이콘은 `currentColor`로 리컬러되므로 색상은 **text 유틸리티**로 지정한다. `fill` / `stroke` prop을 직접 쓰지 않는다.

```tsx
// 올바른
<Icon name="add" className="text-icon-primary" />
<Icon name="error--filled" className="text-support-error" />

// 금지
<Icon name="add" fill="#0f62fe" />
```

> 아이콘은 Carbon 32-grid 기반의 충실한 재구성이며 `@carbon/icons` 바이트-포-바이트 복사본이 아니다. 픽셀 정확도가 필요하면 `@carbon/icons`를 설치하고 path 데이터를 교체한다.

# Citations

- `packages/ui/src/index.ts` — 전체 export surface
- `packages/ui/README.md` — "What's inside", "The CatchUP look" 섹션
- `docs/reference/07-design-system.md` — §2 "CVA 변형 시스템"
- `CLAUDE.md` — "컴포넌트 컨벤션" 섹션
