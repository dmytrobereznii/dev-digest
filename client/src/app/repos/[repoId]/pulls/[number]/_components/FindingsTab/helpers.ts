import type { ReviewRecord, SeverityCounts } from "@devdigest/shared";

/** Per-severity counts of each run's review, keyed by `run_id`, for the
 *  timeline. Dismissed findings drop out, as they do on the PR list. */
export function severityCountsByRun(reviews: ReviewRecord[]): Record<string, SeverityCounts> {
  const byRun: Record<string, SeverityCounts> = {};
  for (const review of reviews) {
    if (!review.run_id) continue;
    const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const f of review.findings) {
      if (!f.dismissed_at) counts[f.severity] += 1;
    }
    byRun[review.run_id] = counts;
  }
  return byRun;
}
