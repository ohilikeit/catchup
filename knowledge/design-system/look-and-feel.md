---
type: Design Guideline
title: CatchUP 룩앤필 규칙
description: IBM Carbon 디자인 언어를 기반으로 한 CatchUP의 시각적 비타협 원칙 — 샤프한 모서리, 1px 보더, 포커스 링, 타이포그래피, 카피 톤.
resource: file:///packages/ui/README.md
tags: [look-and-feel, carbon, typography, focus, borders, copy]
timestamp: 2026-06-17T00:00:00Z
---

# CatchUP 룩앤필 규칙

CatchUP은 generic shadcn이 아니라 **IBM Carbon** 디자인 언어를 직접 재구현했다. 아래 규칙은 모든 UI 작업에서 반드시 지켜야 하는 비타협 원칙이다.

## 색상 아키텍처

- **단 하나의 interactive blue**: `#0f62fe` (`--blue-60`). 브랜드 강조색으로 모든 인터랙티브 요소에 사용.
- **중립 gray 아키텍처**: 배경·레이어·보더는 gray 램프(`--gray-10` ~ `--gray-100`).
- **상태 표현**: 고정된 support 4종만 사용 — `support-error`(red), `support-success`(green), `support-warning`(yellow), `support-info`(blue). 채워진(filled) 아이콘과 쌍을 이룬다.

### 절대 금지

```
이모지  그라디언트  teal/purple/magenta 강조색  임의 색상 하드코딩
bg-blue-500  #hex 직접 기입
```

## 모서리 (Border Radius)

Carbon은 기본적으로 **샤프(0)**다.

| 값 | 사용처 |
|----|--------|
| `rounded-none` (기본, 0) | 버튼, 카드, 패널, 인풋, 모달 등 모든 구조적 컴포넌트 |
| `rounded-sm` (2px) | 툴팁 등 미세한 소프트닝이 필요한 경우 |
| `rounded-pill` (999px) | Tag/chip 전용 |

```tsx
// 올바른 예 — 카드에 radius 없음
<div className="bg-layer-02 border border-border-subtle-01 p-05">…</div>

// 금지 — rounded-lg, rounded-xl, rounded-2xl 사용 불가
<div className="bg-layer-02 rounded-lg p-4">…</div>
```

## 구조 표현 방식

- **1px 보더 + 배경 단계(layer)**로 계층을 표현한다.
- `border border-border-subtle-01` + `bg-layer-01` / `bg-layer-02` 조합.
- 그림자는 **떠 있는 레이어에만** 허용 — `shadow-menu`, `shadow-overlay`, `shadow-modal`, `shadow-tooltip`.
- 일반 카드·패널·인풋에 `drop-shadow` 또는 `shadow-*` 금지.

```tsx
// 올바른 — 떠 있는 드롭다운
<div className="bg-layer-02 border border-border-subtle-01 shadow-menu">…</div>

// 올바른 — 모달
<div className="bg-background shadow-modal">…</div>

// 금지 — 일반 카드에 그림자
<div className="bg-layer-02 shadow-md rounded-lg">…</div>
```

## 포커스 링

Carbon 시그니처: **2px inset blue 링**.

```css
/* tailwind-preset.js 정의 */
shadow-focus:       inset 0 0 0 2px var(--focus)
shadow-focus-inset: inset 0 0 0 1px var(--focus), inset 0 0 0 2px var(--focus-inset)
```

모든 인터랙티브 컴포넌트는 `focus-visible:shadow-focus-inset`을 반드시 포함한다.

```tsx
// Button.tsx 패턴
className="focus-visible:outline-none focus-visible:shadow-focus-inset …"
```

다크모드에서 `--focus`가 `var(--white)`, `--focus-inset`이 `var(--gray-100)`으로 전환 → 흰 외곽 + 짙은 인셋.

## 타이포그래피

폰트 패밀리: **IBM Plex Sans / IBM Plex Sans KR / IBM Plex Mono / IBM Plex Serif**. Google Fonts에서 로드(`tokens.css` 상단 `@import`).

타입 스케일 클래스는 `.cds-*` 접두사:

| 클래스 | 용도 |
|--------|------|
| `.cds-label-01` | 12px 레이블 |
| `.cds-body-compact-01` | 14px 본문(compact) |
| `.cds-body-01` | 14px 본문 |
| `.cds-heading-01` | 14px semibold 소제목 |
| `.cds-heading-03` | 20px 400 섹션 헤딩 |
| `.cds-heading-06` | 42px 300 대형 헤딩 |

**큰 헤딩일수록 weight가 가볍다** — `heading-06`/`heading-07`은 `font-weight: 300`. "무거운 헤딩"은 Carbon 룩이 아니다.

```tsx
// 올바른
<h1 className="cds-heading-05 text-text-primary">제목</h1>
<p  className="cds-body-01 text-text-secondary">설명</p>

// 금지
<h1 className="text-2xl font-bold">제목</h1>
```

## 카피 톤

- **문장형(sentence case)**: 첫 글자만 대문자, 나머지 소문자. Title Case 금지.
- **동사 우선(verb-first)**: 버튼·액션 레이블은 동사로 시작 — "저장", "시험 시작", "결과 보기".
- **사실적·무감정(blameless, factual)**: 오류 메시지도 탓하지 않고 무슨 일이 일어났는지만 서술.
- **이모지 금지**: UI 내 이모지 사용 불가.

```
올바른: "시험을 시작할 수 없습니다. 회차가 아직 열리지 않았습니다."
금지:   "😢 아직 시험을 시작할 수 없어요!"
```

## 상태 아이콘

상태 표현에는 반드시 **채워진(filled) 아이콘 + support 색상 4종** 조합을 사용.

```tsx
<Icon name="error--filled" className="text-support-error" />
<Icon name="checkmark--filled" className="text-support-success" />
<Icon name="warning--filled" className="text-support-warning" />
<Icon name="information--filled" className="text-support-info" />
```

outline 아이콘을 상태 표현에 사용하지 않는다.

# Citations

- `packages/ui/README.md` — "The CatchUP look (non-negotiables)" 섹션
- `CLAUDE.md` — "프론트엔드 작업은 반드시 디자인 시스템을 따른다" 섹션
- `packages/ui/src/styles/tokens.css` — radius, shadow, focus 변수
- `packages/ui/tailwind-preset.js` — borderRadius, boxShadow 매핑
