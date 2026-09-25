import type { CSSProperties } from "react";

/** Co-located styles for VerdictBanner — sizes match findings.jsx:78-99. */
export const s = {
  wrap: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  iconBox: (bg: string, color: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  label: (color: string): CSSProperties => ({ fontSize: 16, fontWeight: 700, color }),
  summary: {
    fontSize: 13.5,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    marginTop: 6,
    textWrap: "pretty",
  } satisfies CSSProperties,
  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
  scoreLabel: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  costRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  costIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
