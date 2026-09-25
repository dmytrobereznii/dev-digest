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
  placeholderCard: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  placeholderBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "24px 16px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    textAlign: "center",
  } satisfies CSSProperties,
  placeholderIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  placeholderText: {
    margin: 0,
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    textWrap: "pretty",
  } satisfies CSSProperties,
  noReview: {
    padding: 16,
    borderRadius: 10,
    border: "1px dashed var(--border)",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
