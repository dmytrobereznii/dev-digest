import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocus. */
export const s = {
  count: {
    marginLeft: 8,
    letterSpacing: 0,
  } satisfies CSSProperties,
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 99,
    background: "var(--accent)",
    flexShrink: 0,
    alignSelf: "center",
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  pathButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--accent)",
    fontSize: 12,
    maxWidth: 360,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
  reason: {
    minWidth: 0,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  none: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
