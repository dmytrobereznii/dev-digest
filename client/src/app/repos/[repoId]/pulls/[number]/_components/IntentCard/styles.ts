import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — ported from the design's `IntentBlock`
    (`screen_pr_detail.jsx:3-19`) plus the D11 additions (label-row badge,
    one-line footer, empty/skeleton states). */
export const s = {
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  quote: {
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    margin: "0 0 14px",
    textWrap: "pretty",
  } satisfies CSSProperties,
  // compact so the badge sits in the SectionLabel row without growing it
  badge: { fontSize: 11, padding: "1px 8px" } satisfies CSSProperties,
  outlineBadge: {
    fontSize: 11,
    padding: "0 7px",
    border: "1px solid var(--text-muted)",
  } satisfies CSSProperties,
  signalsLine: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: "-8px 0 14px",
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  colHeader: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color,
    marginBottom: 7,
    letterSpacing: "0.04em",
  }),
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  listItem: (color: string): CSSProperties => ({
    fontSize: 12.5,
    color,
    display: "flex",
    gap: 7,
    lineHeight: 1.45,
  }),
  bullet: (color: string): CSSProperties => ({ color, marginTop: 1 }),
  nothingStated: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "16px 0",
  } satisfies CSSProperties,
  footerLabel: { fontWeight: 600 } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  } satisfies CSSProperties,
  sourceIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  sourceRef: { color: "var(--text-secondary)", minWidth: 0 } satisfies CSSProperties,
  sourceReason: { color: "var(--text-muted)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: "6px 12px",
    fontSize: 11.5,
    color: "var(--text-muted)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  footerModel: { color: "var(--text-secondary)" } satisfies CSSProperties,
  staleNote: { color: "var(--warn)" } satisfies CSSProperties,
  rederiveButton: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
