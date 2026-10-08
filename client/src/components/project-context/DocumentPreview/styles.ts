import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 28px", overflow: "auto", flex: 1 } satisfies CSSProperties,
  inner: { maxWidth: 680, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
