import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseControl. */
export const s = {
  wrap: { display: "inline-flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
};
