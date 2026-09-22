/* Suspense fallback for /agents while the segment streams. AgentsListView keeps
   its own `isLoading` branch for the TanStack Query fetch, which this
   server-side boundary never sees. */

/* "use client": these render AppShell and the @devdigest/ui barrel, and that
   barrel reaches recharts — a client-only library that throws
   "Super expression must either be null or a function" the moment it is pulled
   into the RSC graph. Every route in this app already puts the boundary at the
   route rung (frontend-architecture § Known exceptions); these follow it.
   A `loading.tsx` works as a Suspense fallback either way. */
"use client";

import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { s } from "./_components/AgentsListView/styles";

const CARDS = 3;

export default function Loading() {
  return (
    <AppShell>
      <div style={s.page}>
        <div style={s.header}>
          <Skeleton height={26} width={160} />
        </div>
        <div style={s.grid}>
          {Array.from({ length: CARDS }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
