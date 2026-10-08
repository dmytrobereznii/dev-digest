import type { CSSProperties } from "react";

/** Co-located styles for RiskAreas. */
export const s = {
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 7,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
    maxWidth: "100%",
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({ color, flexShrink: 0, marginTop: 2 }),
  text: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  refs: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  } satisfies CSSProperties,
  ref: {
    fontSize: 11.5,
    color: "var(--accent-text)",
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
