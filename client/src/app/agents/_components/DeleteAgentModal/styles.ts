import type { CSSProperties } from "react";

/** Co-located styles for DeleteAgentModal (mirrors the skill delete dialog). */
export const s = {
  body: {
    padding: "18px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  text: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
