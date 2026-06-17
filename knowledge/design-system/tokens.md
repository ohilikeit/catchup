---
type: Design Token System
title: CatchUP 토큰 시스템
description: IBM Carbon 팔레트 위에 2겹 토큰 구조(raw 램프 → semantic 역할)를 올려 다크모드를 순수 토큰 스왑으로 구현하는 시스템.
resource: file:///packages/ui/src/styles/tokens.css
tags: [tokens, dark-mode, tailwind, carbon, css-variables]
timestamp: 2026-06-17T00:00:00Z
---

# CatchUP 토큰 시스템

`packages/ui/src/styles/tokens.css`와 `packages/ui/tailwind-preset.js`가 한 쌍을 이룬다. 컴포넌트는 semantic 역할 유틸리티만 사용하므로 `.dark` 클래스 토글 한 번으로 전체 테마가 전환된다 — `dark:` 변형 없이.

## 2겹 구조

### 1겹 — Raw 팔레트 (Carbon 램프)

`tokens.css`의 `:root` 최상단에 hex 값으로 정의. **컴포넌트에서 직접 쓰지 않는다** — 최후 수단.

```css
/* Gray ramp */
--gray-10: #f4f4f4;
--gray-100: #161616;

/* Blue ramp (primary/interactive) */
--blue-60: #0f62fe;   /* 단 하나의 interactive blue */

/* Red ramp (danger/error) */
--red-60: #da1e28;

/* Support hues */
--green-50: #24a148;
--yellow-30: #f1c21b;
```

### 2겹 — Semantic 역할 토큰

컴포넌트가 실제로 참조하는 이름. 값은 raw 램프를 `var()` 참조.

```css
:root {
  /* 배경 & 레이어 */
  --background: var(--white);
  --layer-01: var(--gray-10);
  --layer-02: var(--white);
  --field-01: var(--gray-10);

  /* 텍스트 */
  --text-primary: var(--gray-100);
  --text-secondary: var(--gray-70);
  --text-error: var(--red-60);

  /* 아이콘 */
  --icon-primary: var(--gray-100);

  /* 보더 */
  --border-subtle-01: var(--gray-20);
  --border-interactive: var(--blue-60);

  /* 인터랙션 / 포커스 */
  --interactive: var(--blue-60);
  --focus: var(--blue-60);
  --focus-inset: var(--white);

  /* 버튼 */
  --button-primary: var(--blue-60);
  --button-danger-primary: var(--red-60);

  /* Support / status */
  --support-error: var(--red-60);
  --support-success: var(--green-50);
  --support-warning: var(--yellow-30);
  --support-info: var(--blue-70);
}
```

## 다크모드 — 순수 토큰 스왑

`.dark` 블록이 semantic 변수만 재정의한다. 컴포넌트 코드는 수정 없음.

```css
.dark,
[data-theme='dark'] {
  --background: var(--gray-100);
  --layer-01: var(--gray-90);
  --layer-02: var(--gray-80);
  --text-primary: var(--gray-10);
  --focus: var(--white);        /* 다크에서 포커스는 흰 링 */
  --focus-inset: var(--gray-100);
  /* … */
}
```

`next-themes`가 `<html class="dark">`를 토글 → CSS 변수 일괄 교체.

## UI Shell — 테마 불변 다크 크롬

헤더·사이드Nav처럼 라이트/다크 무관하게 **항상 짙은** 표면은 별도 `--shell-*` 토큰을 사용한다. `.dark` 블록이 이 토큰을 재정의하지 않으므로 캐스케이드로 불변 보장.

```css
:root {
  --shell-bg: var(--gray-100);
  --shell-bg-hover: #2c2c2c;
  --shell-text: var(--white);
  --shell-text-secondary: var(--gray-30);
  --shell-text-muted: var(--gray-50);
  --shell-border: var(--gray-80);
  --shell-accent: var(--blue-60);
  --shell-accent-text: var(--blue-40);
}
```

## Tailwind preset 매핑

`tailwind-preset.js`가 Tailwind 유틸리티 → semantic CSS 변수로 연결.

```js
// packages/ui/tailwind-preset.js
colors: {
  background: { DEFAULT: 'var(--background)', inverse: 'var(--background-inverse)' },
  layer:      { '01': 'var(--layer-01)', '02': 'var(--layer-02)', '03': 'var(--layer-03)' },
  text:       { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)',
                error: 'var(--text-error)', 'on-color': 'var(--text-on-color)' },
  border:     { 'subtle-01': 'var(--border-subtle-01)', interactive: 'var(--border-interactive)' },
  support:    { error: 'var(--support-error)', success: 'var(--support-success)',
                warning: 'var(--support-warning)', info: 'var(--support-info)' },
  shell:      { DEFAULT: 'var(--shell-bg)', text: 'var(--shell-text)', … },
},
boxShadow: {
  focus:        'inset 0 0 0 2px var(--focus)',
  'focus-inset':'inset 0 0 0 1px var(--focus), inset 0 0 0 2px var(--focus-inset)',
},
```

## 스페이싱 (Carbon 2px 미니유닛)

| 유틸 | 값 |
|------|----|
| `gap-01` / `p-01` | 2px |
| `gap-03` / `p-03` | 8px |
| `gap-05` / `p-05` | 16px |
| `gap-06` / `p-06` | 24px |
| `gap-07` / `p-07` | 32px |

## Examples

```tsx
// 올바른 사용 — 역할 유틸리티만
<div className="bg-background border border-border-subtle-01 text-text-primary p-05">
  <span className="text-text-secondary">보조 설명</span>
  <span className="text-support-error">오류 메시지</span>
</div>

// 항상 짙은 헤더
<header className="bg-shell text-shell-text border-b border-shell-border">…</header>
```

### 절대 금지

```tsx
// raw hex 하드코딩
<div className="bg-[#0f62fe]" />

// raw Tailwind 색상
<div className="bg-blue-500 text-gray-700" />

// raw Carbon 램프를 컴포넌트에서 직접 사용
<div className="bg-blue-60" />   // 최후 수단일 때만 허용
```

# Citations

- `packages/ui/src/styles/tokens.css`
- `packages/ui/tailwind-preset.js`
- `packages/ui/README.md` — "Theming" 섹션
- `docs/reference/07-design-system.md` — §3 "2겹 토큰 + 자동 다크모드"
