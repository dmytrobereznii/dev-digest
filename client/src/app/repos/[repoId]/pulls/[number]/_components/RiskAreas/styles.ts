import type { CSSProperties } from "react";

/** Co-located styles for RiskAreas. */
export const s = {
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({ color, flexShrink: 0, marginTop: 2 }),
  text: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  } satisfies CSSProperties,
  title: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  refs: {
    display: "flex",
    flexWrap: "wrap",
    gap: "2px 10px",
  } satisfies CSSProperties,
  ref: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  none: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
