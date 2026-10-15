import type { CSSProperties } from "react";

export const s = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  metric: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  track: {
    width: 56,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-subtle, var(--border))",
    overflow: "hidden",
  } satisfies CSSProperties,
  status: { color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  failed: { color: "var(--crit)" } satisfies CSSProperties,
};
