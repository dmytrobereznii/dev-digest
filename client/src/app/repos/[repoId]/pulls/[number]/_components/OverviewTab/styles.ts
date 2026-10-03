import type { CSSProperties } from "react";

export const s = {
  briefSection: {
    marginBottom: 28,
  } satisfies CSSProperties,
  // gap 16 between the banner and the grid, as in the design's BriefCard
  briefStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  noReview: {
    padding: 16,
    borderRadius: 10,
    border: "1px dashed var(--border)",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
