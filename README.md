# CatchUP Platform

Monorepo for the CatchUP platform. The first thing built here is the **CatchUP Design System** —
a productive, enterprise UI system built on **IBM Carbon** foundations (Apache-2.0), implemented in
the shadcn-style architecture the platform standardizes on (Tailwind tokens + CVA + `cn`).

> The design system was handed off from [claude.ai/design](https://claude.ai/design) as an
> HTML/CSS/JS prototype bundle ("CatchUP Design System") and re-implemented here as real,
> typed React components. See [docs/](docs/) for the platform's broader design decisions.

## Structure

```
catchup_platform/
├── apps/
│   └── web/              Next.js App Router app — design-system showcase + Console kit demo
└── packages/
    ├── ui/               @app/ui   — design system (tokens, icons, components)  ← no deps
    └── core/             @app/core — theme (next-themes) + toasts               ← depends on ui
```

Dependency direction is one-way and acyclic: `ui ← core ← web`. Internal packages are **build-less**
(`main` → `src`, React as a `peerDependency`); Next compiles them via `transpilePackages`.

## Getting started

```bash
pnpm install
pnpm dev        # → http://localhost:3000
```

- **`/`** — the design-system gallery: color ramps, the Carbon Productive type scale, every
  component primitive, and the full 43-glyph icon set. Toggle dark mode in the header.
- **`/console`** — the **Console UI kit**: a click-through enterprise app (login → shell →
  overview / users / settings) with sortable tables, modals, and toasts, assembled entirely from
  `@app/ui` + `@app/core`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run the web app (Next dev server). |
| `pnpm build` | Production build of the web app. |
| `pnpm typecheck` | `tsc --noEmit` across every package. |
| `pnpm lint` | Next lint on the web app. |

## The CatchUP look

One interactive blue (`#0f62fe`), neutral gray architecture, **sharp corners**, IBM Plex type,
2px-based spacing, shadows only on floating layers, a loud 2px blue focus ring. Status is shown with
filled icons + the fixed support quartet — **no emoji, no gradients, no rounded "friendly" cards.**
Full guidelines live in [`packages/ui/README.md`](packages/ui/README.md).

## Theming

Components use semantic role utilities (`bg-layer-02`, `text-text-secondary`) only — never raw
colors. Dark mode is a pure token swap: `next-themes` toggles `.dark` and the Carbon Gray-100 theme
re-themes everything with zero `dark:` variants.
