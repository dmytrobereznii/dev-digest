/* The PR detail route's loading shape. Rendered from TWO places on purpose:
   `loading.tsx` (the App Router's Suspense fallback, shown while the segment's
   RSC payload streams) and the page's own `isLoading` branch (shown while
   TanStack Query fetches on the client). They are different moments — the
   framework boundary cannot see a client-side query — so the component exists
   to keep one shape rather than two. */
"use client";

import { Skeleton } from "@devdigest/ui";
import { s } from "../../styles";

export function PrDetailSkeleton() {
  return (
    <div style={s.skeletonStack}>
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
