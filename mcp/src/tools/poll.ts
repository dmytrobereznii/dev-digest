/**
 * Small polling helpers shared by `run-agent-on-pr.ts` and `get-findings.ts`
 * (SHOULD-FIX/architecture-reviewer): both attach to or wait on runs from
 * `GET /pulls/:id/runs` / `GET /pulls/:id/runs/active` on an interval, and
 * both need "the newest of these by `ran_at`". Kept in one place so the
 * tie-break rule and the sleep helper cannot drift between the two call
 * sites.
 */

/** Newest-first by `ran_at` (ISO 8601, so string comparison is
 * chronological); a null/missing `ran_at` sorts as the earliest. */
export function newestByRanAt<T extends { ran_at: string | null }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => (b.ran_at ?? '').localeCompare(a.ran_at ?? ''))[0];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
