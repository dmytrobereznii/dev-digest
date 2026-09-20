import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: "18px 22px 8px" } satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  rowCell: { flex: 1 } satisfies CSSProperties,
  /* The toggle sits on the same baseline as the SelectInput beside it. */
  toggleWrap: { display: "flex", alignItems: "center", height: 36 } satisfies CSSProperties,
  toggleDisabled: { opacity: 0.45, pointerEvents: "none" } satisfies CSSProperties,
  provenance: { marginTop: 4 } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: "10px 13px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  error: { marginTop: 12, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  footerNote: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginRight: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
} as const;
