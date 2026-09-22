/* Suspense fallback for /repos/:repoId/pulls while the segment streams. The
   page keeps its own `isLoading` branch for the TanStack Query fetch, which
   this server-side boundary never sees — see the note in
   `[number]/_components/PrDetailSkeleton`. */

/* "use client": these render AppShell and the @devdigest/ui barrel, and that
   barrel reaches recharts — a client-only library that throws
   "Super expression must either be null or a function" the moment it is pulled
   into the RSC graph. Every route in this app already puts the boundary at the
   route rung (frontend-architecture § Known exceptions); these follow it.
   A `loading.tsx` works as a Suspense fallback either way. */
"use client";

import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export default function Loading() {
  return (
    <AppShell>
      <div style={s.pageHeader}>
        <Skeleton height={26} width={200} />
      </div>
      <div style={s.tableCard}>
        <div style={s.loadingStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={28} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
