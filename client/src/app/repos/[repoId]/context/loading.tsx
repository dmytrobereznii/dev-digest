/* Suspense fallback for /repos/:repoId/context. ProjectContextView keeps its
   own `isLoading` branch for the TanStack Query fetch (client INSIGHTS.md). */
"use client";

import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SKELETON_ROWS } from "./_components/ProjectContextView/constants";
import { s } from "./_components/ProjectContextView/styles";

export default function Loading() {
  return (
    <AppShell>
      <div style={s.skeletonStack}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    </AppShell>
  );
}
