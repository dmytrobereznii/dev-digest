import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 680 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  serializes: { marginTop: 16 } satisfies CSSProperties,
  serializesLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
    marginBottom: 6,
  } satisfies CSSProperties,
  serializesBox: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  } satisfies CSSProperties,
} as const;
