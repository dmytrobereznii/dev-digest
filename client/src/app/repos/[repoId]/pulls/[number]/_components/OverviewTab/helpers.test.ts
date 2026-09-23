import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { briefVerdict } from "./helpers";

const finding = (severity: FindingRecord["severity"], dismissed = false) =>
  ({ severity, dismissed_at: dismissed ? "2026-09-20T00:00:00.000Z" : null }) as FindingRecord;

const review = (over: Partial<ReviewRecord>): ReviewRecord =>
  ({
    id: "r",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 70,
    model: null,
    cost_usd: 0.01,
    grounding: null,
    created_at: "2026-09-20T00:00:00.000Z",
    findings: [],
    ...over,
  }) as ReviewRecord;

describe("briefVerdict", () => {
  it("picks the newest review that has a verdict, skipping summaries", () => {
    const reviews = [
      review({ id: "summary", kind: "summary", verdict: "approve" }),
      review({ id: "newest", verdict: "request_changes" }),
      review({ id: "older", verdict: "approve" }),
    ];
    expect(briefVerdict(reviews, [])?.review.id).toBe("newest");
  });

  it("counts only undismissed CRITICAL findings as blockers", () => {
    const reviews = [
      review({ findings: [finding("CRITICAL"), finding("CRITICAL", true), finding("WARNING")] }),
    ];
    expect(briefVerdict(reviews, [])?.blockers).toBe(1);
  });

  it("attaches the review's own run for cost and tokens", () => {
    const run = { run_id: "run1", cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 } as RunSummary;
    const other = { run_id: "run2", cost_usd: 9, tokens_in: 1, tokens_out: 1 } as RunSummary;
    expect(briefVerdict([review({})], [other, run])?.run).toBe(run);
  });

  it("returns null when the PR has never been reviewed", () => {
    expect(briefVerdict([], [])).toBeNull();
    expect(briefVerdict(undefined, undefined)).toBeNull();
  });
});
