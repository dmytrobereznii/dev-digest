import type { CSSProperties } from "react";

/** Styles for the Smart Diff view (spec 08 §7 step 6). */
export const s = {
  statsRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: 14,
  } satisfies CSSProperties,
  stats: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  addText: { fontFamily: "var(--font-mono, monospace)", color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { fontFamily: "var(--font-mono, monospace)", color: "var(--code-del-text)" } satisfies CSSProperties,
  toggleSlot: { marginLeft: "auto" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  noReview: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "10px 0",
  } satisfies CSSProperties,
  unavailable: {
    fontSize: 13,
    color: "var(--warn)",
    padding: "10px 0",
  } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
