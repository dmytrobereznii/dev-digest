import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestRunFindings, previewText, totalFindings } from "./helpers";

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> & Pick<ReviewRecord, "id">): ReviewRecord {
  return {
    pr_id: "p1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    cost_usd: null,
    created_at: "2026-09-16T00:00:00Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

describe("latestRunFindings", () => {
  it("takes the first (newest) review, skipping summaries", () => {
    const reviews = [
      review({ id: "s", kind: "summary", findings: [finding({ id: "x" })] }),
      review({ id: "new", findings: [finding({ id: "n" })] }),
      review({ id: "old", findings: [finding({ id: "o" })] }),
    ];
    expect(latestRunFindings(reviews).map((f) => f.id)).toEqual(["n"]);
  });

  it("drops dismissed findings and sorts most severe first", () => {
    const reviews = [
      review({
        id: "r",
        findings: [
          finding({ id: "s", severity: "SUGGESTION" }),
          finding({ id: "d", severity: "CRITICAL", dismissed_at: "2026-09-16T00:00:00Z" }),
          finding({ id: "c", severity: "CRITICAL" }),
          finding({ id: "w", severity: "WARNING" }),
        ],
      }),
    ];
    expect(latestRunFindings(reviews).map((f) => f.id)).toEqual(["c", "w", "s"]);
  });

  it("is empty before the reviews load or when there is no review", () => {
    expect(latestRunFindings(undefined)).toEqual([]);
    expect(latestRunFindings([review({ id: "s", kind: "summary" })])).toEqual([]);
  });
});

describe("totalFindings / previewText", () => {
  it("sums the severity counts, treating missing as zero", () => {
    expect(totalFindings({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 })).toBe(6);
    expect(totalFindings(null)).toBe(0);
  });

  it("strips bold/code markers and collapses whitespace", () => {
    expect(previewText("A **literal** `sk_live`\n\nkey")).toBe("A literal sk_live key");
    expect(previewText(null)).toBe("");
  });
});
