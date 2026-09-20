import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab (transcribed from screen_skills.jsx:165). */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  blurb: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${current ? "var(--border-strong)" : "var(--border)"}`,
    background: "var(--bg-elevated)",
  }),
  chip: (current: boolean): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 700,
    color: current ? "var(--accent-text)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    padding: "3px 9px",
    borderRadius: 6,
    flexShrink: 0,
  }),
  meta: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 13, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  date: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
} as const;
