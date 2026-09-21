import type { CSSProperties } from "react";
import { FILTER_WIDTH } from "./constants";

/** Co-located styles for the agent editor's Skills tab (screen_agents.jsx:36). */
export const s = {
  wrap: { maxWidth: 680 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: FILTER_WIDTH } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  /* `dragging` dims the row under the cursor's ghost; `over` draws the drop
     line above the row the pointer is on, so the landing slot is visible
     before the mouse is released. */
  row: (linked: boolean, dragging: boolean, over: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    borderTop: over ? "2px solid var(--accent)" : "1px solid var(--border)",
    background: linked ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.4 : linked ? 1 : 0.7,
  }),
  handle: (linked: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    cursor: linked ? "grab" : "default",
    opacity: linked ? 1 : 0.35,
    flexShrink: 0,
  }),
  box: (linked: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    padding: 0,
    borderRadius: 4,
    border: `1.5px solid ${linked ? "var(--accent)" : "var(--border-strong)"}`,
    background: linked ? "var(--accent)" : "transparent",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0,
  }),
  name: { fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0 } satisfies CSSProperties,
  pill: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: `${color}1a`,
    padding: "1px 7px",
    borderRadius: 4,
  }),
  moves: { display: "flex", gap: 2, flexShrink: 0 } satisfies CSSProperties,
  movesSpacer: { width: 52, flexShrink: 0 } satisfies CSSProperties,
} as const;
