/* 404 boundary. Reached by `notFound()` from a repo-scoped page whose :repoId
   matches no known repo, and by any unrouted URL. RepoNotFound is the right
   surface for both: a dead link in this app is almost always a stale repo id,
   and its CTA ("Add repository") is the recovery either way. */

/* "use client": these render AppShell and the @devdigest/ui barrel, and that
   barrel reaches recharts — a client-only library that throws
   "Super expression must either be null or a function" the moment it is pulled
   into the RSC graph. Every route in this app already puts the boundary at the
   route rung (frontend-architecture § Known exceptions); these follow it.
   A `loading.tsx` works as a Suspense fallback either way. */
"use client";

import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";

export default function NotFound() {
  return (
    <AppShell>
      <RepoNotFound />
    </AppShell>
  );
}
