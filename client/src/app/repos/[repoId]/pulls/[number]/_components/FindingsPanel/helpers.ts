import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** How many findings sit at each severity — counted over the run's full set, so
 *  a chip's number doesn't move as the filters narrow the list below it. */
export function countBySeverity(findings: FindingRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/** Keep the selected severities, optionally drop low-confidence, sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  sevFilter: Record<string, boolean>,
): FindingRecord[] {
  let shown = findings.filter((f) => sevFilter[f.severity]);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
