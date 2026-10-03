import type { CSSProperties } from "react";

/** Co-located styles for BriefSummary — the summary block above the grid. */
export const s = {
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    textWrap: "pretty",
  } satisfies CSSProperties,
  muted: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px 12px",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaLabel: { fontWeight: 600 } satisfies CSSProperties,
  mono: { color: "var(--text-secondary)" } satisfies CSSProperties,
  staleNote: { color: "var(--warn)" } satisfies CSSProperties,
  error: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  errorRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
} as const;
