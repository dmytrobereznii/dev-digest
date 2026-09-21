/* Suspense fallback for /repos/:repoId/conventions while the segment streams.
   ConventionsView keeps its own `isLoading` branch for the TanStack Query
   fetch, which this server-side boundary never sees (client INSIGHTS.md,
   measured) — the two cover different moments and both are needed. */

/* "use client": this renders AppShell and the @devdigest/ui barrel, and that
   barrel reaches recharts — a client-only library that throws
   "Super expression must either be null or a function" the moment it is pulled
   into the RSC graph, from a stack that names neither this file nor the barrel.
   Every route in this app already puts the boundary at the route rung. */
"use client";

import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import {
  SKELETON_CARDS,
  SKELETON_CARD_HEIGHT,
} from "./_components/ConventionsView/constants";
import { s } from "./_components/ConventionsView/styles";

export default function Loading() {
  return (
    <AppShell>
      <div style={s.page}>
        <div style={s.header}>
          <Skeleton height={26} width={280} />
        </div>
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
