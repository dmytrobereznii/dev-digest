import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { severityCountsByRun } from "./helpers";

function review(runId: string | null, findings: Partial<FindingRecord>[]): ReviewRecord {
  return {
    id: `rv-${runId}`,
    pr_id: "pr1",
    agent_id: null,
    run_id: runId,
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 70,
    model: null,
    cost_usd: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: findings.map((f, i) => ({ id: `f${i}`, dismissed_at: null, ...f }) as FindingRecord),
  };
}

describe("severityCountsByRun", () => {
  it("counts each run's findings per severity, skipping dismissed ones", () => {
    const counts = severityCountsByRun([
      review("run-1", [
        { severity: "CRITICAL" },
        { severity: "CRITICAL", dismissed_at: "2026-06-12T00:00:00.000Z" },
        { severity: "SUGGESTION" },
      ]),
      review("run-2", []),
    ]);
    expect(counts).toEqual({
      "run-1": { CRITICAL: 1, WARNING: 0, SUGGESTION: 1 },
      "run-2": { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });
  });

  it("ignores a review with no run to attach to", () => {
    expect(severityCountsByRun([review(null, [{ severity: "WARNING" }])])).toEqual({});
  });
});
