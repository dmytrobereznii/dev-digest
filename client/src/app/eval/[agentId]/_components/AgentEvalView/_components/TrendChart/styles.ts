import type { CSSProperties } from "react";

export const s = {
  legend: { display: "flex", justifyContent: "flex-end", gap: 16, fontSize: 12 } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  swatch: { width: 12, height: 3, borderRadius: 2, display: "inline-block" } satisfies CSSProperties,
  svg: { width: "100%", height: "auto", display: "block", marginTop: 8 } satisfies CSSProperties,
};
