import type { CSSProperties } from "react";

export const s = {
  tile: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    minWidth: 0,
  } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  } satisfies CSSProperties,
  value: { fontSize: 26, fontWeight: 700, color: "var(--text)" } satisfies CSSProperties,
  delta: { fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  spark: { marginTop: 8 } satisfies CSSProperties,
};
