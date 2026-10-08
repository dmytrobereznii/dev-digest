import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 680 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
} as const;
