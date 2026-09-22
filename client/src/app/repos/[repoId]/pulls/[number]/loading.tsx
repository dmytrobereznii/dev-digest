/* Suspense fallback for /repos/:repoId/pulls/:number while the segment streams.
   The page keeps its own `isLoading` branch: this boundary is a SERVER one and
   never sees the TanStack Query fetch that actually populates the page. Both
   render PrDetailSkeleton, so there is one shape, not two. */

/* "use client": these render AppShell and the @devdigest/ui barrel, and that
   barrel reaches recharts — a client-only library that throws
   "Super expression must either be null or a function" the moment it is pulled
   into the RSC graph. Every route in this app already puts the boundary at the
   route rung (frontend-architecture § Known exceptions); these follow it.
   A `loading.tsx` works as a Suspense fallback either way. */
"use client";

import { AppShell } from "@/components/app-shell";
import { PrDetailSkeleton } from "./_components/PrDetailSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <PrDetailSkeleton />
    </AppShell>
  );
}
