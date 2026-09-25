import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard — ported from the design's
    `blast.jsx` (`BlastRadiusSummary`, `BlastRadiusTree`, `BlastRadius`'s
    toggle) plus D8's caller-row layout. The Tree|Graph toggle copies
    `DiffTab/_components/OrderToggle`'s segmented-control and disabled
    styles rather than importing that route-scoped component (D8). */
export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    // The card is a `briefGrid` `1fr` grid item; a grid item's automatic
    // minimum width defaults to its content's min-content size, so a long
    // unbroken caller path (nowrap) widens the whole track. `minWidth: 0`
    // lets the grid shrink the card to the track's actual width.
    minWidth: 0,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    flex: "1 1 auto",
    minWidth: 0,
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--text-secondary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  statIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  statCount: {
    color: "var(--text-primary)",
    fontWeight: 650,
  } satisfies CSSProperties,
  // OrderToggle's segmented-control wrap (DiffTab/_components/OrderToggle/styles.ts)
  toggleWrap: {
    marginLeft: "auto",
    flexShrink: 0,
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
  toggleBtn: {
    padding: "3px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  // OrderToggle's disabled state (opacity + not-allowed cursor over the base button)
  toggleBtnDisabled: {
    padding: "3px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    opacity: 0.5,
    cursor: "not-allowed",
  } satisfies CSSProperties,
  notice: {
    margin: "0 0 12px",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  rowHeader: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: 6,
    padding: "5px 6px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  rowHeaderOpen: {
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  chevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
    transition: "transform .12s",
  } satisfies CSSProperties,
  chevronOpen: {
    transform: "rotate(90deg)",
  } satisfies CSSProperties,
  symbolIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  symbolName: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  callerCount: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginLeft: "auto",
  } satisfies CSSProperties,
  // Design's `BlastRadiusTree` caller container (blast.jsx:40).
  rowBody: {
    padding: "4px 0 8px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,
  // Design's `TreeRow` (blast.jsx:13-24), depth 1: paddingLeft = depth*18.
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "3px 0",
    paddingLeft: 18,
    position: "relative",
    fontSize: 12.5,
    minWidth: 0,
  } satisfies CSSProperties,
  // TreeRow's guide lines: a vertical rule at left: depth*18-10 (=8 at depth
  // 1), `bottom` set per-row by the caller (50% on the last row with no
  // chips following, else the full row), plus an 8px horizontal tick at the
  // row's vertical centre.
  callerGuideV: {
    position: "absolute",
    left: 8,
    top: 0,
    width: 1,
    background: "var(--border-strong)",
  } satisfies CSSProperties,
  callerGuideH: {
    position: "absolute",
    left: 8,
    top: "50%",
    width: 8,
    height: 1,
    background: "var(--border-strong)",
  } satisfies CSSProperties,
  callerIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  callerPath: {
    flex: "0 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  callerPathText: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  callerName: {
    marginLeft: "auto",
    color: "var(--text-muted)",
    textAlign: "right",
    flexShrink: 0,
  } satisfies CSSProperties,
  chipsRowEndpoints: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    padding: "8px 0 2px 18px",
  } satisfies CSSProperties,
  chipsRowCrons: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    padding: "6px 0 2px 18px",
  } satisfies CSSProperties,
  noDownstream: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  truncated: {
    margin: "10px 0 0",
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
