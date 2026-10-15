import type { EvalRunSummary } from "@devdigest/shared";

/** Runs shown under Recent runs on the tab. */
export const RECENT_RUNS = 5;

/** The newest completed run and the one before it; `runs` is newest first. */
export function getCompletedRuns(runs: EvalRunSummary[]): {
  latest: EvalRunSummary | null;
  previous: EvalRunSummary | null;
} {
  const done = runs.filter((r) => r.status === "completed");
  return { latest: done[0] ?? null, previous: done[1] ?? null };
}
