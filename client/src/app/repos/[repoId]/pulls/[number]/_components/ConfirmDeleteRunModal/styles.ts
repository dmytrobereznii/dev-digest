import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 } satisfies CSSProperties,
};
