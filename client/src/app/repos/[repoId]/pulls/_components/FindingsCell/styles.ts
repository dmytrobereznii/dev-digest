import type { CSSProperties } from "react";
import { POPOVER_WIDTH } from "./constants";

/** Co-located styles for FindingsCell and its popover. Ported from
 *  screen_dashboard.jsx (FindingsCell) and prdetail_runs.jsx (FindingsTooltip). */
export const s = {
  trigger: {
    display: "inline-flex",
    width: "fit-content",
    cursor: "help",
    outline: "none",
  } satisfies CSSProperties,
  popover: (pos: { left: number; top?: number; bottom?: number }): CSSProperties => ({
    position: "fixed",
    ...pos,
    zIndex: 60,
    width: POPOVER_WIDTH,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    animation: "ddpop .12s ease",
    cursor: "default",
    textAlign: "left",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 9,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
    maxHeight: 300,
    overflow: "auto",
  } satisfies CSSProperties,
  item: (last: boolean): CSSProperties => ({
    paddingBottom: last ? 0 : 9,
    borderBottom: last ? "none" : "1px solid var(--border)",
  }),
  titleRow: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 5 } satisfies CSSProperties,
  location: { fontSize: 11, color: "var(--accent-text)" } satisfies CSSProperties,
  rationale: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    marginTop: 5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  empty: { color: "var(--text-muted)" } satisfies CSSProperties,
  status: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
