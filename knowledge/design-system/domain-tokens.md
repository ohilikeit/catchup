---
type: Design Token
title: 도메인 토큰
description: 평가 플랫폼 도메인 의미를 담는 역할 토큰 — 색을 하드코딩하지 않고 tokens.css에 추가하는 원칙.
resource: file:///docs/reference/07-design-system.md
tags: [domain-tokens, score, status, color, tokens]
timestamp: 2026-06-17T00:00:00Z
---

# 도메인 토큰

## 원칙

**색을 컴포넌트에 하드코딩하지 않는다.** 도메인 의미(예: "통과", "실패", "채점 중")가 있는 색은 `tokens.css`에 의미 있는 이름의 CSS 변수로 추가한 뒤 Tailwind 유틸리티로 사용한다.

이렇게 하면:
- 리스킨 시 토큰 한 줄만 바꾸면 된다.
- 다크모드 대응을 `.dark` 블록 한 곳에서 처리할 수 있다.
- 컴포넌트 코드에 raw hex나 raw Carbon 램프가 섞이지 않는다.

## 현재 상태 (미구현)

평가/상태 도메인 토큰은 **아직 `tokens.css`에 추가되지 않았다.** 평가 기능 착수 시 추가 예정.

```css
/* 아직 미구현 — 평가 기능 착수 시 tokens.css에 추가 예정 */
:root {
  --score-pass:    #24a148;   /* green-50 재사용 */
  --score-fail:    #da1e28;   /* red-60 재사용   */
  --score-partial: #f1c21b;   /* yellow-30 재사용 */
  --status-grading: #4589ff;  /* blue-50 재사용  */
}
```

값은 Carbon 램프(`--green-50`, `--red-60`, …)의 hex 값을 그대로 사용한다. 새 hex를 임의로 만들지 않는다.

## 추가 절차

1. `packages/ui/src/styles/tokens.css`의 `:root` 블록에 의미 토큰 추가.
2. 필요하면 `.dark` 블록에 다크모드 값 추가.
3. `packages/ui/tailwind-preset.js`의 `colors` 섹션에 Tailwind 유틸리티 매핑 추가.
4. 컴포넌트에서 `text-score-pass`, `bg-score-fail` 등 역할 유틸리티로 사용.

```js
// tailwind-preset.js에 추가 예시
colors: {
  score: {
    pass:    'var(--score-pass)',
    fail:    'var(--score-fail)',
    partial: 'var(--score-partial)',
  },
  status: {
    grading: 'var(--status-grading)',
  },
}
```

```tsx
// 컴포넌트 사용 예
<span className="text-score-pass">통과</span>
<span className="text-score-fail">실패</span>
<span className="text-score-partial">부분 점수</span>
<Badge className="bg-status-grading text-text-on-color">채점 중</Badge>
```

## 절대 금지

```tsx
// raw hex 하드코딩
<span style={{ color: '#24a148' }}>통과</span>

// raw Carbon 램프 직접 사용 (앱 코드 내)
<span className="text-green-50">통과</span>

// support 토큰 오용 (도메인 의미가 다를 때)
<span className="text-support-success">통과</span>  // support-success는 시스템 상태용
```

## 연관 문서

- [토큰 시스템](/design-system/tokens.md) — 2겹 토큰 구조와 추가 방법
- [컴포넌트 카탈로그](/design-system/components.md) — 실제 사용 컴포넌트 목록

# Citations

- `docs/reference/07-design-system.md` — §6 "AI 평가 플랫폼 — 도메인 토큰 (예정)"
- `CLAUDE.md` — "색은 하드코딩하지 말고 도메인 의미 토큰으로 확장" 원칙
