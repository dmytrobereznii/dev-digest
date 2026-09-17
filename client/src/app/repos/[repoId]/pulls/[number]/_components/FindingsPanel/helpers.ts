import type { FindingRecord } from "@devdigest/shared";
import { FILTERABLE_SEVERITIES, LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** How many findings sit at each severity — counted over the run's full set, so
 *  a pill's number doesn't move as the filters narrow the list below it. */
export function countBySeverity(findings: FindingRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/** The severities that get a pill: only those the run actually has, in
 *  CRITICAL → WARNING → SUGGESTION order. */
export function presentSeverities(counts: Record<string, number>): string[] {
  return FILTERABLE_SEVERITIES.filter((sv) => (counts[sv] ?? 0) > 0);
}

/** Keep the selected severity (null = all), optionally drop low-confidence,
 *  sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: string | null,
): FindingRecord[] {
  let shown = severity ? findings.filter((f) => f.severity === severity) : findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
