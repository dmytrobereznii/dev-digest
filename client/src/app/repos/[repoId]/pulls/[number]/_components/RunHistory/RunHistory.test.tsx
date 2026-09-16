/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, SeverityCounts } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], severityCounts?: Record<string, SeverityCounts>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} severityCounts={severityCounts} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost", () => {
  it("a done run shows its token count and cost under the time", () => {
    renderRuns([run({ status: "done", tokens_in: 9119, cost_usd: 0.0013, score: 61 })]);
    expect(screen.getByText(/9,119 tok · \$0\.001/)).toBeInTheDocument();
  });

  it("a done run on an unpriced model shows an em-dash instead of a number", () => {
    renderRuns([run({ status: "done", tokens_in: 100, cost_usd: null, score: 61 })]);
    expect(screen.getByText(/100 tok · —/)).toBeInTheDocument();
  });

  it("a failed run shows no token/cost line at all", () => {
    renderRuns([run({ status: "failed", error: "boom", cost_usd: null, score: null })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity counts", () => {
  it("a done run shows its review's non-zero severity counts beside the blockers", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 2, score: 38 })], {
      "run-1": { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
    });
    expect(screen.getByLabelText("2 critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 warning")).toBeInTheDocument();
    expect(screen.queryByLabelText(/suggestion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("a done run whose review has no findings says so instead of an empty row", () => {
    renderRuns([run({ status: "done", findings_count: 0, score: 95 })], {
      "run-1": { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });

  it("a done run without a loaded review falls back to the plain finding count", () => {
    renderRuns([run({ status: "done", findings_count: 3, score: 72 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/critical|warning|suggestion/)).not.toBeInTheDocument();
  });
});
