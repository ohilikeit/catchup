# 07. 디자인 시스템 (@app/ui)

> **이 문서의 성격**: 아래 "원칙"은 JABIS(`jabis-hr/packages/ui`)를 분석해 뽑은 *학습 노트*다.
> 단, **실제 CatchUP 구현은 generic shadcn이 아니라 IBM Carbon 기반**으로 진화했다.
> 그래서 코드 예시는 이 레포의 실제 값(`packages/ui`)으로 다시 적었다.
> **구현의 단일 진실(source of truth)은 항상 `packages/ui`이며, 본 문서가 어긋나면 코드가 이긴다.**
> 전체 사용 규칙은 [packages/ui/README.md](../packages/ui/README.md)와 루트 `CLAUDE.md` 참조.

## 핵심 한 줄
**엔지니어링 패턴은 shadcn(Radix Slot + Tailwind + CVA + cn, 소유형 소스), 디자인 언어는 IBM
Carbon(2겹 토큰 + IBM Plex + 샤프 모서리 + 2px 포커스).** 즉 "Carbon의 룩을 shadcn 방식으로
직접 구현". `@carbon/react`를 import하지 않고 `packages/ui`에 손으로 재구성했다.

> ⚠️ JABIS는 generic shadcn이라 `npx shadcn init/add`, HSL 토큰, Pretendard, 둥근 radius를
> 썼다. **우리는 이 중 어느 것도 쓰지 않는다.** 그건 반면교사 기록일 뿐, 따라하면 Carbon 룩이 깨진다.

## 1. cn() — 기반 유틸 (shadcn 패턴 그대로)
```ts
// packages/ui/src/lib/cn.ts
export const cn = (...inputs) => twMerge(clsx(inputs))
```
- clsx: 조건부 클래스 합침. twMerge: Tailwind 충돌 "뒤가 이김"(`px-2 px-4`→`px-4`).
- [x] 모든 컴포넌트가 `className={cn(기본, props.className)}` → 기본+override 안전.

## 2. CVA 변형 시스템 (shadcn 패턴 + Carbon 변형 명칭)
```tsx
// packages/ui/src/components/Button.tsx — 실제 구현 발췌
const buttonVariants = cva('focus-visible:outline-none focus-visible:shadow-focus-inset …', {
  variants: {
    kind: { primary, secondary, tertiary, ghost, danger },  // ← Carbon 버튼 명칭
    size: { sm, md, lg },
    iconOnly: { true, false },
  },
  defaultVariants: { kind: 'primary', size: 'lg', iconOnly: false },
})
const Button = forwardRef(({ className, kind, size, asChild, ...p }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ kind, size, className }))} ref={ref} {...p} />
})
```
- [x] CVA: 공통기본 + 축별 클래스 + 기본값 → 조합형 API.
- [x] **변형 명칭은 Carbon**: `kind`는 `primary/secondary/tertiary/ghost/danger` (shadcn의
  `default/destructive/outline`이 **아니다**).
- [x] **asChild + Radix Slot**: `<Button asChild><Link/></Button>` = 링크에 버튼 스타일(시맨틱 유지).
- [x] forwardRef 필수(부모 ref 전달).

## 3. ⭐ 2겹 토큰 + 자동 다크모드 (구조는 학습대로, 값은 Carbon)
**1겹 raw 팔레트 + 2겹 semantic 역할** — `packages/ui/src/styles/tokens.css`. **HSL이 아니라 hex**:
```css
:root {
  /* 1겹 raw: Carbon 램프 */
  --blue-60: #0f62fe;  --gray-100: #161616;  --red-60: #da1e28;  /* … 10~100 단계 */
  /* 2겹 semantic 역할: 컴포넌트가 쓰는 것 */
  --background: var(--white);     --layer-01: var(--gray-10);   --layer-02: var(--white);
  --text-primary: var(--gray-100);--text-secondary: var(--gray-70);
  --button-primary: var(--blue-60);--support-error: var(--red-60);--focus: var(--blue-60);
}
.dark { --background: var(--gray-100); --layer-02: var(--gray-80); --text-primary: #f4f4f4; /* … */ }
```
**preset이 유틸리티 → semantic 변수로 매핑** (`packages/ui/tailwind-preset.js`):
```js
darkMode: ['class', '[data-theme="dark"]'],
colors: {
  background: 'var(--background)', layer: { '02': 'var(--layer-02)' },
  text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)' },
  button: { primary: 'var(--button-primary)' }, support: { error: 'var(--support-error)' },
},
fontFamily: { sans: 'var(--font-sans)' /* IBM Plex Sans */ },
borderRadius: { none: 'var(--radius-none)', sm: '2px', pill: '999px', DEFAULT: 0 }, // 샤프
boxShadow: { focus: 'inset 0 0 0 2px var(--focus)' }, // Carbon 2px 인셋 포커스
```
- [x] 컴포넌트는 **역할 유틸리티만** (`bg-layer-02`, `text-text-secondary`, `bg-button-primary`,
  `text-support-error`) → 다크모드 시 변수값만 바뀜, **컴포넌트 무수정**(`dark:` 안 붙임).
- [x] `bg-blue-60`(raw 램프) 대신 `bg-button-primary`/`bg-interactive`(역할) → 색 변경/리스킨 시
  토큰 한 줄. raw 램프 직접 사용은 **최후의 수단**(앱 코드에 두면 안 됨).
- [x] **hex로 저장**(JABIS의 HSL 채널 방식 아님). 폰트는 **IBM Plex** Sans/Mono/Serif(Pretendard 아님).
- [x] radius는 거의 **0(샤프)** — `sm`(2px)·`pill`만 예외. 그림자는 **떠 있는 레이어**(menu/modal/
  tooltip)에만. 포커스는 **2px 인셋 블루 링**.

## 3b. UI Shell 토큰 — 테마 불변 다크 크롬
헤더·사이드nav·다크 히어로 패널처럼 **라이트/다크 무관하게 항상 짙은** 표면은 별도 토큰셋이다.
`--background-inverse`(다크모드에서 밝아짐)로는 표현 못 하므로 전용 `--shell-*`를 둔다.
```css
:root { /* .dark가 재정의하지 않음 → 캐스케이드로 테마 불변 보장 */
  --shell-bg: var(--gray-100); --shell-bg-hover: #2c2c2c; --shell-text: var(--white);
  --shell-text-secondary: var(--gray-30); --shell-text-muted: var(--gray-50);
  --shell-border: var(--gray-80); --shell-accent: var(--blue-60); --shell-accent-text: var(--blue-40);
}
```
- [x] 유틸: `bg-shell`, `text-shell-text`, `text-shell-text-secondary`, `border-shell-border`,
  `bg-shell-accent` 등. 다크 크롬에는 raw 램프 대신 **이 토큰을 쓴다**(`SiteHeader`, 로그인 히어로).

## 4. 다크모드 토글
- **`next-themes`** 사용(`@app/core`). `<html>`에 `.dark` 토글 → CSS변수 일괄 교체, SSR 깜빡임 방지.
- `layout.tsx`의 `<html>`엔 `suppressHydrationWarning` 필수(next-themes가 하이드레이션 전 클래스 설정).

## 5. preset 공유
```js
presets: [require('@app/ui/tailwind-preset')]   // 모든 앱이 같은 Carbon 토큰 상속 = 일관성
```
- 앱 `tailwind.config.ts`의 `content`가 `../../packages/{ui,core}/src/**`를 스캔해야 패키지 내부
  유틸리티가 purge되지 않는다.

## 6. 🎯 AI 평가 플랫폼 — 도메인 토큰 (예정)
shadcn CLI(`npx shadcn add`)는 **쓰지 않는다.** 없는 컴포넌트는 기존 패턴을 따라 `@app/ui`에 직접
추가한다. 색은 하드코딩하지 말고 도메인 의미 토큰으로 확장:
```css
/* 아직 미구현 — 평가/상태 UI 들어올 때 tokens.css에 hex로 추가 예정 */
:root { --score-pass: #24a148; --score-fail: #da1e28; --score-partial: #f1c21b;
        --status-grading: #4589ff; }
```
- [ ] 점수/상태 도메인 토큰(`score-pass`/`fail`/`partial`, `status-*`)은 **아직 없음** — 평가 기능
  착수 시 추가. 추가 시 raw 램프 재사용(hex 직접값 권장은 Carbon 램프에서 고르기).

## 체크리스트 (현재 구현 기준)
- [x] cn() = twMerge(clsx())
- [x] CVA 변형 + asChild(Radix Slot) + forwardRef
- [x] 2겹 토큰(raw 램프 → semantic 역할), **hex**, preset 매핑
- [x] IBM Plex 타이포 / 샤프 radius / 2px 인셋 포커스 / 떠 있는 레이어만 그림자
- [x] UI Shell 테마-불변 토큰(`--shell-*`)
- [x] next-themes 다크모드(역할 토큰이라 컴포넌트 무수정)
- [x] preset 공유 + content glob
- [ ] 도메인 토큰(score/status) — **미구현, 평가 기능 시 추가**

## JABIS 대비 무엇이 바뀌었나 (반면교사 기록)
| JABIS(학습 노트) | CatchUP(실제) |
|---|---|
| generic shadcn, `npx shadcn init/add` | Carbon 룩 수제 재구성, CLI 미사용 |
| CSS변수 **HSL 채널**(`0 0% 100%`) | **hex**(`#ffffff`) |
| `Pretendard, Inter` | **IBM Plex** Sans/Mono/Serif |
| `borderRadius {lg:8,md:6,sm:4}` 둥근 | 샤프(0), `sm`(2px)·`pill`만 |
| variants `default/destructive/outline` | `kind: primary/secondary/tertiary/ghost/danger` |
| 토큰 `--primary/--card/bg-card` | Carbon 역할 `--layer-0x/--support-*/bg-layer-02` |
