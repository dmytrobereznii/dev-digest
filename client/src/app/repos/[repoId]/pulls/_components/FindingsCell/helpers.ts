import type { FindingRecord, ReviewRecord, SeverityCounts } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * The findings behind a PR row's Findings column: the latest `review` (the
 * list is newest first) with dismissed findings dropped — the same set the
 * server counts in `GET /repos/:id/pulls` — sorted most severe first.
 */
export function latestRunFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  const latest = reviews?.find((r) => r.kind === "review");
  if (!latest) return [];
  return latest.findings
    .filter((f) => !f.dismissed_at)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

export function totalFindings(counts: SeverityCounts | null | undefined): number {
  return counts ? counts.CRITICAL + counts.WARNING + counts.SUGGESTION : 0;
}

/** A finding's rationale as one line of plain text for a two-line preview. */
export function previewText(markdown: string | null | undefined): string {
  return (markdown ?? "").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
}
