# @app/core — theme + shared client utilities

Sits **above** `@app/ui` in the dependency graph (`ui ← core ← app`). Holds cross-cutting client
concerns that the design system itself shouldn't own.

| Export | What it is |
|---|---|
| `ThemeProvider` | Wraps `next-themes` (`attribute="class"`, system sync, no SSR flash). Toggling adds `.dark` to `<html>`, which swaps the semantic token values in `@app/ui`'s `tokens.css`. |
| `useTheme` | Re-exported from `next-themes`. |
| `ThemeToggle` | Ready-made icon button that flips light/dark. |
| `ToastProvider` / `useToast` | Toast queue + bottom-right viewport rendered with `@app/ui`'s `Notification`. Call `toast({ kind, title, message })` from anywhere inside the provider. |

```tsx
// app/layout.tsx — composition root
<ThemeProvider>
  <ToastProvider>{children}</ToastProvider>
</ThemeProvider>

// anywhere
const { toast } = useToast();
toast({ kind: 'success', title: 'Saved.', message: 'Your changes were saved.' });
```
