import type { CSSProperties } from "react";

/** Segmented-control tokens (design has no kit equivalent — diff.jsx:72-77). */
export const s = {
  wrap: {
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
} as const;

/** Per-button style; `active` gets the elevated background + primary text. */
export function btnStyle(active: boolean): CSSProperties {
  return {
    padding: "3px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  };
}
