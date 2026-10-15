import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  link: { marginLeft: "auto", fontSize: 13, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  casesHeader: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  controls: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  runError: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-muted)", padding: "20px 0" } satisfies CSSProperties,
  recent: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
