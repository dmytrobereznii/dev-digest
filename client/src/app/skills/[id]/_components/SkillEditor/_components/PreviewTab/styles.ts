import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab (mirrors VersionsTab's frame). */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  blurb: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  sheet: {
    padding: "18px 22px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
} as const;
