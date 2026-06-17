---
type: Design Principle
title: 디자인 시스템 원칙 (IBM Carbon 기반)
description: 엔지니어링 패턴은 shadcn(Radix Slot + CVA + cn), 디자인 언어는 IBM Carbon(2겹 토큰 + IBM Plex + 샤프 모서리 + 2px 포커스). @app/ui에 소유형 소스로 직접 구현.
resource: file:///docs/reference/07-design-system.md
tags:
  - design-system
  - carbon
  - tokens
  - tailwind
timestamp: 2026-06-17T00:00:00Z
---

# 디자인 시스템 원칙 (IBM Carbon 기반)

구체적인 컴포넌트 구현과 사용 규칙은 [/design-system/](/design-system/) 도메인(아직 미작성)과
`packages/ui/README.md`에 있다. 이 문서는 **왜** 이 구조를 택했는지를 담는다.

> ⚠️ **코드가 이긴다.** 구현의 단일 진실(source of truth)은 항상 `packages/ui`이며,
> 이 문서가 어긋나면 코드를 따른다.

## 핵심 결정: Carbon 룩 + shadcn 방식으로 직접 구현

**엔지니어링 패턴**: shadcn (Radix Slot + Tailwind + CVA + cn, 소유형 소스).
**디자인 언어**: IBM Carbon (2겹 토큰 + IBM Plex + 샤프 모서리 + 2px 인셋 포커스).

`@carbon/react`를 import하지 않고 `packages/ui`에 직접 재구성했다.
`npx shadcn init/add`도 쓰지 않는다 — 없는 컴포넌트가 필요하면 기존 패턴을 따라 `@app/ui`에 직접 추가한다.

JABIS의 generic shadcn(HSL 토큰, Pretendard, 둥근 모서리)은 반면교사 — 따라하면 Carbon 룩이 깨진다.

## 결정 1: cn() — 기반 유틸

```ts
export const cn = (...inputs) => twMerge(clsx(inputs))
```

모든 컴포넌트가 `className={cn(기본, props.className)}` 패턴을 사용한다.
clsx: 조건부 클래스 합침. twMerge: Tailwind 충돌 "뒤가 이김" (`px-2 px-4` → `px-4`).

## 결정 2: CVA 변형 시스템 + Carbon 명칭

```tsx
const buttonVariants = cva('focus-visible:outline-none focus-visible:shadow-focus-inset …', {
  variants: {
    kind: { primary, secondary, tertiary, ghost, danger },  // Carbon 버튼 명칭
    size: { sm, md, lg },
  },
  defaultVariants: { kind: 'primary', size: 'lg' },
})
```

변형 명칭은 **Carbon**: `kind`는 `primary/secondary/tertiary/ghost/danger`.
shadcn의 `default/destructive/outline`이 아니다.

컴포넌트는 `forwardRef` + `asChild`(Radix Slot) 패턴을 따른다:
```tsx
const Comp = asChild ? Slot : 'button'
return <Comp className={cn(buttonVariants({ kind, size, className }))} ref={ref} {...p} />
```

## 결정 3: 2겹 토큰 구조 (자동 다크모드의 척추)

`packages/ui/src/styles/tokens.css`에 2겹으로 정의한다:

```css
:root {
  /* 1겹 raw: Carbon 팔레트 램프 (hex, HSL 아님) */
  --blue-60: #0f62fe;  --gray-100: #161616;  --red-60: #da1e28;

  /* 2겹 semantic 역할: 컴포넌트가 실제로 쓰는 것 */
  --background: var(--white);
  --layer-01: var(--gray-10);
  --text-primary: var(--gray-100);
  --button-primary: var(--blue-60);
  --support-error: var(--red-60);
}
.dark {
  --background: var(--gray-100);
  --text-primary: #f4f4f4;
  /* … */
}
```

`packages/ui/tailwind-preset.js`가 Tailwind 유틸리티 → semantic 변수로 매핑한다.
컴포넌트는 **역할 유틸리티만** 사용한다 (`bg-layer-02`, `text-text-secondary`, `text-support-error`).
`.dark` 클래스 토글만으로 전체가 리테마된다 — **`dark:` 변형 없이**.

## 결정 4: UI Shell 토큰 — 테마 불변 다크 크롬

헤더·사이드 nav처럼 **라이트/다크 무관하게 항상 짙은** 표면은 `--shell-*` 전용 토큰을 쓴다.
`.dark`가 재정의하지 않으므로 테마 불변이 보장된다:

```css
:root {
  --shell-bg: var(--gray-100);
  --shell-text: var(--white);
  --shell-accent: var(--blue-60);
}
```

유틸: `bg-shell`, `text-shell-text`, `border-shell-border` 등.

## 결정 5: Carbon 디자인 언어 규칙

- **모서리**: 거의 0(샤프). `sm`(2px)·`pill`(999px)만 예외. `rounded-lg` 금지.
- **폰트**: IBM Plex Sans/Mono/Serif. Pretendard/Inter 사용 금지.
- **포커스**: 2px 인셋 블루 링 (`shadow-focus-inset`). Tailwind `ring-*` 패턴 아님.
- **그림자**: 떠 있는 레이어(menu/modal/tooltip)에만. 카드에 그림자 없음.
- **색상**: 역할 토큰 우선 (`bg-button-primary`). raw 램프(`bg-blue-60`)는 최후의 수단.
- **색상 금지**: `bg-blue-500`, `#hex` 하드코딩, `rounded-lg`.

## 결정 6: 다크모드 — next-themes

`@app/core`의 `ThemeProvider`(next-themes)가 `<html>`에 `.dark`를 토글한다.
`layout.tsx`의 `<html>`에 `suppressHydrationWarning` 필수 (next-themes가 하이드레이션 전 클래스 설정).

## 결정 7: 도메인 토큰 (미구현, 착수 시 추가)

```css
/* tokens.css에 hex로 추가 예정 — Carbon 램프에서 고르기 */
:root {
  --score-pass:    #24a148;   /* green-40 */
  --score-fail:    #da1e28;   /* red-60   */
  --score-partial: #f1c21b;   /* yellow-30 */
  --status-grading: #4589ff;  /* blue-40  */
}
```

색을 하드코딩하지 말고 도메인 의미 토큰으로 확장한다. 평가 기능 착수 시 `tokens.css`에 추가.

> **구현 현황**: `score-pass`, `score-fail`, `score-partial`, `status-grading` 토큰은 현재 `tokens.css`에 **없다**. `shell-*` 토큰(`--shell-bg`, `--shell-text`, `--shell-accent` 등)은 구현되어 있다.

## 결정 8: 빌드 없는 패키지 + content glob

`@app/ui`는 빌드 스텝 없이 소스를 직접 export한다([framework-monorepo](/platform/framework-monorepo.md) 참조).
`apps/web/tailwind.config.ts`의 `content` glob이 `../../packages/*/src/**`를 스캔해야
패키지 내부 유틸리티가 purge되지 않는다.

# Citations

1. `docs/reference/07-design-system.md` — 디자인 시스템 원문
2. `packages/ui/README.md` — 전체 컴포넌트 사용 규칙
3. `CLAUDE.md` — 프론트엔드 작업 규칙 (디자인 시스템 강제)
4. `docs/reference/01-framework-monorepo.md` — 빌드 없는 내부 패키지
