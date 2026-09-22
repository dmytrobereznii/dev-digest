import type { CSSProperties } from "react";

/** Co-located styles for the PR detail route (extracted from inline objects,
 *  per frontend-architecture § Styling). Shared with PrDetailSkeleton so the
 *  loading shape and the loaded shape stay in step. */
export const s = {
  skeletonStack: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
  content: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
};
