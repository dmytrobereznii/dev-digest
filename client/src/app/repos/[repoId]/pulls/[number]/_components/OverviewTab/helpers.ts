import type { ReviewRecord, RunSummary } from "@devdigest/shared";

export interface BriefVerdict {
  review: ReviewRecord & { verdict: NonNullable<ReviewRecord["verdict"]> };
  blockers: number;
  run: RunSummary | null;
}

/**
 * The review the PR Brief's verdict banner shows: the newest `kind: "review"`
 * with a verdict — the same "newest review" rule the PR list uses for its
 * score (server/.context/docs/pr-list-read-model.md), so the two never
 * disagree. `reviews` arrive newest-first. Blockers count the way the per-run
 * accordion does: undismissed CRITICAL findings. Cost and tokens come from
 * that review's own run.
 */
export function briefVerdict(
  reviews: ReviewRecord[] | undefined,
  runs: RunSummary[] | undefined,
): BriefVerdict | null {
  const review = (reviews ?? []).find((r) => r.kind === "review" && r.verdict != null);
  if (!review || review.verdict == null) return null;
  const blockers = review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const run = (runs ?? []).find((r) => r.run_id === review.run_id) ?? null;
  return { review: { ...review, verdict: review.verdict }, blockers, run };
}
