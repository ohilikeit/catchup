# @app/ui — CatchUP Design System

A productive, enterprise design system built on **IBM Carbon** foundations (Apache-2.0),
delivered as the shadcn-style architecture the platform standardizes on: **Tailwind tokens +
CVA + `cn`**, driven by Carbon's design language (sharp corners, IBM Plex, one interactive blue,
2px spacing, shadows only on floating layers).

Build-less internal package: `main` points at `src/index.ts` and React is a `peerDependency`.
Apps compile it via `transpilePackages` — there is no build step here.

## What's inside

| Path | What it is |
|---|---|
| `src/styles/tokens.css` | All design tokens as CSS variables — raw Carbon ramps + semantic roles, spacing, sizing, radius, elevation, motion, and the `.cds-*` type scale. Includes a Gray-100 **dark theme** (`.dark`). Loads IBM Plex from Google Fonts. |
| `tailwind-preset.js` | Maps Tailwind utilities → semantic tokens (`bg-background`, `text-text-secondary`, `shadow-focus-inset`, …). Shared via `presets: [require('@app/ui/tailwind-preset')]`. |
| `src/lib/cn.ts` | `cn()` — `twMerge(clsx(...))`, the shadcn base utility. |
| `src/icons/` | The Carbon icon engine: `glyphs.ts` (43 glyph paths + `STATUS_ICON`) and `<Icon name="…" />`. |
| `src/components/` | Primitives: `Button`, `Field`, `Input`, `Select`, `Checkbox`, `Radio`, `Toggle`, `Tag`, `Notification`, `Tile`, `Menu`, `Link`. |
| `src/kit/` | Composed Console pieces: `AppHeader`, `SideNav`, `Modal`, `Breadcrumb`, `MetricTile`/`MetricGrid`, `DataTable`. |

## Usage

```tsx
// 1. once, at the app root (e.g. globals.css)
@import '@app/ui/styles/tokens.css';

// 2. tailwind.config.ts
import preset from '@app/ui/tailwind-preset';
export default { presets: [preset], content: [/* … */, '../../packages/ui/src/**/*.{ts,tsx}'] };

// 3. anywhere
import { Button, Field, Input, Icon } from '@app/ui';

<Button kind="primary" icon="add">Create</Button>
```

## The CatchUP look (non-negotiables)

- One interactive blue (`#0f62fe`); neutral gray architecture; status only via the fixed support
  quartet + filled icons. **No emoji, no gradients, no rounded "friendly" cards.**
- **Sharp corners**; 1px borders + background steps for structure; shadows only on floating layers
  (menu/modal/toast); a loud 2px blue focus ring.
- **IBM Plex Sans / Mono / Serif**; Carbon Productive scale — big headings get *lighter*, not heavier.
- Sentence case everywhere; verb-first actions; blameless, factual copy.

## Theming

Components use semantic role utilities only (`bg-layer-02`, `text-text-secondary`,
`border-border-subtle-01`), never raw colors. Dark mode is a pure token swap: `next-themes` toggles
`.dark` on `<html>` and the same components re-theme with **zero `dark:` variants**.

> Icons are faithful reconstructions of Carbon's 32-grid geometry, not byte-for-byte
> `@carbon/icons`. For pixel-exact production parity, install `@carbon/icons` and swap the path data.
