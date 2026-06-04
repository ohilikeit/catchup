# 07. 디자인 시스템 (@jabis/ui)

> 출처: `jabis-hr/packages/ui/src/lib/utils.js`, `components/button.jsx`, `tailwind.preset.js`, `src/globals.css`, `packages/core/ThemeProvider.jsx`

## 핵심 한 줄
**Radix + Tailwind + CVA + tailwind-merge = shadcn/ui 아키텍처. `npx shadcn init`으로 공짜 도입. 의미론적 CSS변수 토큰으로 다크모드 자동.**

## 1. cn() — 기반 유틸
```js
export const cn = (...inputs) => twMerge(clsx(inputs))
```
- clsx: 조건부 클래스 합침. twMerge: Tailwind 충돌 "뒤가 이김"(`px-2 px-4`→`px-4`).
- [x] 모든 컴포넌트가 `className={cn(기본, props.className)}` → 기본+override 안전.

## 2. CVA 변형 시스템
```jsx
const buttonVariants = cva("공통 기본 클래스", {
  variants: { variant: {default,destructive,outline,ghost,success,warning}, size:{default,sm,lg,icon} },
  defaultVariants: { variant:'default', size:'default' },
})
const Button = forwardRef(({className,variant,size,asChild,...p}, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({variant,size,className}))} ref={ref} {...p} />
})
```
- [x] CVA: 공통기본 + 축별 클래스 + 기본값 → 조합형 API.
- [x] **asChild+Radix Slot**: `<Button asChild><Link/></Button>` = 링크에 버튼 스타일(시맨틱 유지).
- [x] forwardRef 필수(부모 ref 전달).

## 3. ⭐ 2겹 토큰 + 자동 다크모드
**1겹 CSS변수(globals.css)** — 의미론적, HSL값만(투명도 조합용):
```css
:root { --background: 0 0% 100%; --primary: 210 85% 55%; --border: 214 32% 91%; ... }
.dark { --background: 224 20% 10%; --primary: 210 85% 60%; ... }  /* 같은 이름 다른 값 */
```
**2겹 Tailwind preset** — 토큰→유틸리티 매핑:
```js
darkMode:["class"],
colors:{ background:"hsl(var(--background))", primary:{DEFAULT:"#2B87EC",foreground:"#FFF"}, success:"#22C55E", ... },
fontFamily:{ sans:['Pretendard','Inter','sans-serif'] }, borderRadius:{lg:"8px",md:"6px",sm:"4px"},
```
- [x] 컴포넌트는 `bg-card`,`text-foreground` 등 **의미론적 토큰만** → 다크모드 시 변수값만 바뀜, **컴포넌트 무수정**(`dark:` 안 붙여도 됨).
- [x] `bg-blue-500`(직접색) 대신 `bg-primary`(역할) → 브랜드색 변경 시 토큰 한 줄.
- [x] HSL값만 저장 → `hsl(var(--x) / 0.5)` 투명도 조합. `-foreground` 짝으로 대비(접근성) 보장.

## 4. 다크모드 토글
```jsx
// <html>에 .dark 클래스 토글 → CSS변수 일괄 교체. localStorage 유지.
root.classList.add(theme)
```
- **Next.js**: 직접 만들지 말고 **`next-themes`**(SSR 깜빡임 방지+시스템연동). shadcn 공식.

## 5. preset 공유
```js
presets: [require('@app/ui/tailwind-preset')]   // 모든 앱이 같은 토큰 상속 = 일관성
```

## 6. 🎯 AI 평가 플랫폼
```bash
npx shadcn@latest init                 # cn/CVA/CSS변수/다크모드 통째 생성
npx shadcn@latest add button card dialog table badge tabs
```
도메인 토큰 확장:
```css
:root { --score-pass:142 71% 45%; --score-fail:0 84% 60%; --score-partial:38 92% 50%; --status-grading:217 91% 60%; }
```
- [x] shadcn 그대로 + **도메인 의미 토큰**(점수/상태)으로 확장. 컴포넌트마다 색 하드코딩 금지.

## 체크리스트
- [x] shadcn init (Radix+Tailwind+CVA+cn)
- [x] cn()으로 기본+override
- [x] CVA 변형, asChild+Slot, forwardRef
- [x] 의미론적 CSS변수 토큰(HSL) + preset 매핑 + -foreground 짝
- [x] next-themes 다크모드(의미론적 토큰이라 컴포넌트 무수정)
- [x] 도메인 토큰(score-pass/fail/partial) 확장
