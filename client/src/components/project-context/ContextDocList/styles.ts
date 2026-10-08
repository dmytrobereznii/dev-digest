import type { CSSProperties } from "react";

export const s = {
  bar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  filter: { flex: 1, maxWidth: 320 } satisfies CSSProperties,
  total: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  itemMissing: {
    border: "1px dashed var(--danger, var(--border-strong))",
    borderRadius: 7,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  dir: { fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" } satisfies CSSProperties,
  missing: { fontSize: 11, color: "var(--danger, var(--text-muted))" } satisfies CSSProperties,
  preview: { borderTop: "1px solid var(--border)", maxHeight: 360, overflow: "auto" } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
