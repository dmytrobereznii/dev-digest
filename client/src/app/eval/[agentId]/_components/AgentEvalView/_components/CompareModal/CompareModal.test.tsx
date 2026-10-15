import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunDetail } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";

let runs: Record<string, EvalRunDetail>;
vi.mock("@/lib/hooks/evals", () => ({
  useEvalRun: (id: string) => ({ data: runs[id], error: null }),
}));

import { CompareModal } from "./CompareModal";

const result = (case_id: string) => ({
  case_id, case_name: case_id, expectation_type: "must_find" as const, pass: true, matched: 1,
  unjudged: 0, kept: 1, dropped: 0, findings: [], duration_ms: 10, cost_usd: null,
});

function detail(id: string, over: Partial<EvalRunDetail> = {}): EvalRunDetail {
  return {
    id, agent_id: "a1", status: "completed", ran_at: "2026-10-01T10:00:00Z", duration_ms: 1000,
    agent_version: 2, system_prompt: "be nice", model: "gpt-a", provider: "openai",
    recall: 0.5, precision: 0.5, citation_accuracy: 1, traces_passed: 3, traces_total: 4,
    cost_usd: 0.01, error: null, results: [result("c1"), result("c2")], ...over,
  } as EvalRunDetail;
}

const onClose = vi.fn();

function setup(older: Partial<EvalRunDetail> = {}, newer: Partial<EvalRunDetail> = {}, ids: [string, string] = ["old", "new"]) {
  runs = {
    old: detail("old", older),
    new: detail("new", { ran_at: "2026-10-05T10:00:00Z", agent_version: 5, recall: 0.8, ...newer }),
  };
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <CompareModal runIds={ids} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

const tile = (label: string) => within(screen.getByRole("dialog")).getByText(label).parentElement!;

beforeEach(() => onClose.mockReset());
afterEach(cleanup);

describe("CompareModal", () => {
  it("the title is vA → vB with the earlier ran_at first, whatever the selection order", () => {
    setup({}, {}, ["new", "old"]);
    expect(screen.getByText("v2 → v5")).toBeInTheDocument();
  });

  it("the Recall, Precision and Citation tiles show the older value, the newer value and the delta in points with a marker", () => {
    setup({}, { citation_accuracy: 0.9 });
    const recall = tile("Recall").textContent!;
    expect(recall).toContain("50%");
    expect(recall).toContain("80%");
    expect(recall).toContain("▲ 30pt");
    const precision = tile("Precision").textContent!;
    expect(precision).toContain("0pt");
    expect(precision).not.toMatch(/[▲▼]/);
    expect(tile("Citation accuracy").textContent).toContain("▼ 10pt");
  });

  it("the Cost tile shows both costs and their difference in USD", () => {
    setup({ cost_usd: 0.01 }, { cost_usd: 0.0125 });
    const cost = tile("Cost").textContent!;
    expect(cost).toContain("$0.0100");
    expect(cost).toContain("$0.0125");
    expect(cost).toContain("$0.0025");
  });

  it("a null value shows — and its tile has no delta", () => {
    setup({ recall: null });
    const recall = tile("Recall").textContent!;
    expect(recall).toContain("—");
    expect(recall).toContain("80%");
    expect(recall).not.toMatch(/[▲▼]|\dpt/);
  });

  it("the prompt diff marks removed and added lines under a legend naming both versions, as text", () => {
    const { container } = setup(
      { system_prompt: "keep\nold line\nend" },
      { system_prompt: "keep\n<b>new</b> **line**\nend" },
    );
    expect(screen.getByText("Removed in v2")).toBeInTheDocument();
    expect(screen.getByText("Added in v5")).toBeInTheDocument();
    const kinds = [...container.querySelectorAll("[data-diff]")].map((e) => [e.getAttribute("data-diff"), e.textContent]);
    expect(kinds).toEqual([
      ["same", "keep"],
      ["removed", "old line"],
      ["added", "<b>new</b> **line**"],
      ["same", "end"],
    ]);
    expect(container.querySelector("b")).toBeNull();
  });

  it("identical prompts show System prompt unchanged", () => {
    const { container } = setup();
    expect(screen.getByText("System prompt unchanged")).toBeInTheDocument();
    expect(container.querySelector("[data-diff]")).toBeNull();
  });

  it("differing models show both ids, older first", () => {
    setup({ model: "gpt-a" }, { model: "gpt-b" });
    expect(screen.getByText("Model: gpt-a → gpt-b")).toBeInTheDocument();
  });

  it("each run's passed over total is shown", () => {
    setup({ traces_passed: 3, traces_total: 4 }, { traces_passed: 5, traces_total: 6 });
    expect(screen.getByText("v2: 3 of 4 passed")).toBeInTheDocument();
    expect(screen.getByText("v5: 5 of 6 passed")).toBeInTheDocument();
  });

  it("Close is the only footer action", () => {
    setup();
    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Close"]);
    fireEvent.click(buttons[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("different case_id sets show the notice with the count only in the older and only in the newer run, also when the totals are equal", () => {
    setup(
      { traces_total: 2, results: [result("c1"), result("c2")] },
      { traces_total: 2, results: [result("c2"), result("c3")] },
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "These runs covered different case sets, so their metrics are not directly comparable: 1 only in v2, 1 only in v5.",
    );
  });

  it("shows no case-set notice when both runs cover the same cases", () => {
    setup();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("Escape closes the modal", () => {
    setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
