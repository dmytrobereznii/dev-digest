import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  text: { fontSize: 13.5, color: "var(--text)", whiteSpace: "pre-wrap" } satisfies CSSProperties,
  muted: { fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "8px 0",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12.5,
    overflow: "auto",
    maxHeight: 320,
  } satisfies CSSProperties,
  line: { display: "block", padding: "0 12px", whiteSpace: "pre" } satisfies CSSProperties,
  added: { background: "var(--ok-bg)", color: "var(--ok)" } satisfies CSSProperties,
  removed: { background: "var(--crit-bg)", color: "var(--crit)" } satisfies CSSProperties,
  hunk: { color: "var(--accent)" } satisfies CSSProperties,
  context: { color: "var(--text)" } satisfies CSSProperties,
  result: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  pass: { borderColor: "var(--ok)", background: "var(--ok-bg)" } satisfies CSSProperties,
  fail: { borderColor: "var(--crit)", background: "var(--crit-bg)" } satisfies CSSProperties,
};
