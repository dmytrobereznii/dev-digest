import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentEvalOverview, EvalRunDetail, EvalRunSummary, EvalTrendPoint } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";
import { formatRanAt } from "@/components/eval/helpers";
import { ApiError } from "@/lib/api";

const refetch = vi.fn();
const mutate = vi.fn();
let overview: { data?: AgentEvalOverview; isLoading: boolean; error: Error | null };
let mutation: { isPending: boolean; error: Error | null };
let details: Record<string, EvalRunDetail>;

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvals: () => ({ ...overview, refetch }),
  useRunEvals: () => ({ ...mutation, mutate }),
  useEvalRun: (id: string) => ({ data: details[id], error: null }),
}));

import { AgentEvalView } from "./AgentEvalView";

function run(i: number, over: Partial<EvalRunSummary> = {}): EvalRunSummary {
  return {
    id: `r${i}`, agent_id: "a1", status: "completed",
    ran_at: `2026-10-${String(i).padStart(2, "0")}T10:00:00Z`, duration_ms: 1000,
    agent_version: i, model: "gpt-x", provider: "openai", recall: 0.8, precision: 0.5,
    citation_accuracy: 0.9, traces_passed: 3, traces_total: 4, cost_usd: 0.0123, error: null, ...over,
  } as EvalRunSummary;
}

function point(i: number, over: Partial<EvalTrendPoint> = {}): EvalTrendPoint {
  return { run_id: `r${i}`, ran_at: `2026-10-0${i}T10:00:00Z`, agent_version: i, recall: 0.8, precision: 0.5, citation_accuracy: 0.9, ...over };
}

function overviewOf(over: Partial<AgentEvalOverview> = {}): AgentEvalOverview {
  return {
    agent: { id: "a1", name: "General", model: "gpt-x", provider: "openai", version: 3 },
    cases: [], cases_total: 4, runs: [run(3), run(2), run(1)], runs_total: 3,
    trend: [point(1, { recall: 0.6, precision: 0.5, citation_accuracy: 1 }), point(2, { recall: 0.8, precision: 0.5, citation_accuracy: 0.9 })],
    ...over,
  } as AgentEvalOverview;
}

function renderView(data: AgentEvalOverview | undefined, state: Partial<typeof overview> = {}) {
  overview = { data, isLoading: false, error: null, ...state };
  const ui = () => (
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <AgentEvalView agentId="a1" />
    </NextIntlClientProvider>
  );
  const utils = render(ui());
  return { ...utils, rerenderView: () => utils.rerender(ui()) };
}

/** The tile whose text starts with the label followed by a value. */
function tile(label: string) {
  return screen
    .getAllByText(label)
    .map((el) => el.parentElement!)
    .find((p) => p.firstElementChild?.textContent === label && new RegExp(`^${label}(\\d+%|—)`).test(p.textContent!))!;
}

const runButton = () => screen.getByRole("button", { name: /^(Run eval|Running…)$/ });
const checkbox = (r: EvalRunSummary) =>
  screen.getByRole("checkbox", { name: `Select run v${r.agent_version} · ${formatRanAt(r.ran_at)}` });

beforeEach(() => {
  refetch.mockReset();
  mutate.mockReset();
  mutation = { isPending: false, error: null };
  details = {};
});
afterEach(cleanup);

describe("AgentEvalView", () => {
  it("shows the agent's name, model, run count, case count, a link back to all agents and Run eval", () => {
    renderView(overviewOf({ runs_total: 7, cases_total: 4 }));
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("gpt-x · 7 runs · 4 cases")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(runButton()).toHaveTextContent("Run eval");
  });

  it("three cards show the newest completed run's value, the delta in points and a sparkline", () => {
    renderView(overviewOf());
    const recall = tile("Recall");
    expect(recall).toHaveTextContent("80%");
    expect(recall).toHaveTextContent("▲ 20pt");
    expect(recall.querySelector("svg path")).not.toBeNull();
    const precision = tile("Precision");
    expect(precision).toHaveTextContent("50%");
    expect(precision.textContent).toContain("0pt");
    expect(precision.textContent).not.toMatch(/[▲▼]/);
    const citation = tile("Citation accuracy");
    expect(citation).toHaveTextContent("90%");
    expect(citation).toHaveTextContent("▼ 10pt");
  });

  it("a null metric leaves that run out of the card's sparkline", () => {
    renderView(
      overviewOf({
        trend: [point(1, { recall: 0.2 }), point(2, { recall: null }), point(3, { recall: 0.6 })],
      }),
    );
    const d = tile("Recall").querySelector("svg path")!.getAttribute("d")!;
    expect(d.match(/[ML]/g)).toEqual(["M", "L"]);
  });

  it("Run eval posts to /agents/:id/eval-runs; it is disabled with no cases and reads Running… during a run", () => {
    const { unmount } = renderView(overviewOf());
    expect(runButton()).toBeEnabled();
    fireEvent.click(runButton());
    expect(mutate).toHaveBeenCalledTimes(1);
    unmount();

    renderView(overviewOf({ cases_total: 0, cases: [] }));
    expect(runButton()).toBeDisabled();
    cleanup();

    renderView(overviewOf({ runs: [run(4, { status: "running", recall: null, precision: null, citation_accuracy: null, traces_passed: null }), run(3)] }));
    expect(runButton()).toBeDisabled();
    expect(runButton()).toHaveTextContent("Running…");
  });

  it("a polled completion updates the cards and the table", () => {
    const running = run(4, { status: "running", recall: null, precision: null, citation_accuracy: null, traces_passed: null });
    const { rerenderView } = renderView(overviewOf({ runs: [running, run(3)], runs_total: 4 }));
    expect(tile("Recall")).toHaveTextContent("80%");
    expect(runButton()).toBeDisabled();

    overview = {
      ...overview,
      data: overviewOf({
        runs: [run(4, { recall: 1, precision: 1, citation_accuracy: 1 }), run(3)],
        runs_total: 4,
        trend: [point(2, { recall: 0.8 }), point(4, { recall: 1, precision: 1, citation_accuracy: 1 })],
      }),
    };
    rerenderView();
    expect(tile("Recall")).toHaveTextContent("100%");
    expect(tile("Recall")).toHaveTextContent("▲ 20pt");
    expect(runButton()).toBeEnabled();
    expect(checkbox(run(4))).toBeInTheDocument();
  });

  it("a failed newest run shows its error beside Run eval", () => {
    renderView(overviewOf({ runs: [run(4, { status: "failed", error: "model exploded", recall: null, precision: null, citation_accuracy: null, traces_passed: null }), run(3)] }));
    expect(screen.getByRole("alert")).toHaveTextContent("Eval run failed: model exploded");
    expect(runButton()).toBeEnabled();
  });

  it("shows a failed POST message beside Run eval", () => {
    mutation = { isPending: false, error: new Error("quota exceeded") };
    renderView(overviewOf());
    expect(screen.getByRole("alert")).toHaveTextContent("quota exceeded");
  });

  it("Recent runs lists up to 20 runs with the seven columns", () => {
    const runs = Array.from({ length: 20 }, (_, i) => run(20 - i));
    renderView(overviewOf({ runs, runs_total: 25 }));
    expect(screen.getByText("Recent runs")).toBeInTheDocument();
    for (const name of ["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(21);
    // newest first
    expect(within(rows[1]!).getByText("v20")).toBeInTheDocument();
    expect(within(rows[20]!).getByText("v1")).toBeInTheDocument();
  });

  it("a null cost renders —", () => {
    renderView(overviewOf({ runs: [run(3, { cost_usd: null }), run(2)] }));
    const cells = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells[cells.length - 1]).toHaveTextContent("—");
    const other = within(screen.getAllByRole("row")[2]!).getAllByRole("cell");
    expect(other[other.length - 1]).toHaveTextContent("$0.0123");
  });

  it("an unknown agent shows a not-found state with a link back to all agents", () => {
    for (const status of [404, 422]) {
      renderView(undefined, { error: new ApiError("nope", status) });
      expect(screen.getByText("This agent does not exist.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
      cleanup();
    }
  });

  it("fewer than two completed runs show the text placeholder", () => {
    const { container } = renderView(overviewOf({ trend: [point(1)], runs: [run(1)], runs_total: 1 }));
    expect(screen.getByText("The trend appears after two completed runs.")).toBeInTheDocument();
    expect(container.querySelector("[data-series]")).toBeNull();
  });

  it("two or more completed runs show the Metric trend chart instead of the placeholder", () => {
    const { container } = renderView(overviewOf());
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-series]")).toHaveLength(3);
    expect(screen.queryByText("The trend appears after two completed runs.")).toBeNull();
  });

  it("completed rows have a checkbox; running and failed rows have none and show their status", () => {
    const blank = { recall: null, precision: null, citation_accuracy: null, traces_passed: null };
    renderView(
      overviewOf({
        runs: [run(5, { status: "running", ...blank }), run(4, { status: "failed", error: "x", ...blank }), run(3)],
      }),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).queryByRole("checkbox")).toBeNull();
    expect(within(rows[1]!).getByText("Running…")).toBeInTheDocument();
    expect(within(rows[2]!).queryByRole("checkbox")).toBeNull();
    expect(within(rows[2]!).getByText("Failed")).toBeInTheDocument();
    expect(within(rows[3]!).getByRole("checkbox")).toBeInTheDocument();
  });

  it("N selected follows the selection", () => {
    renderView(overviewOf());
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    fireEvent.click(checkbox(run(3)));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(checkbox(run(2)));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(checkbox(run(3)));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("Compare is disabled unless exactly two runs are selected", () => {
    renderView(overviewOf());
    const compare = () => screen.getByRole("button", { name: "Compare" });
    expect(compare()).toBeDisabled();
    fireEvent.click(checkbox(run(3)));
    expect(compare()).toBeDisabled();
    fireEvent.click(checkbox(run(2)));
    expect(compare()).toBeEnabled();
    fireEvent.click(checkbox(run(2)));
    expect(compare()).toBeDisabled();
  });

  it("with two selected the other checkboxes are disabled", () => {
    renderView(overviewOf());
    fireEvent.click(checkbox(run(3)));
    fireEvent.click(checkbox(run(2)));
    expect(checkbox(run(1))).toBeDisabled();
    expect(checkbox(run(3))).toBeEnabled();
    expect(checkbox(run(2))).toBeEnabled();
  });

  it("closing the Compare modal keeps both runs selected", () => {
    details = {
      r3: { ...run(3), system_prompt: "p", results: [] } as EvalRunDetail,
      r2: { ...run(2), system_prompt: "p", results: [] } as EvalRunDetail,
    };
    renderView(overviewOf());
    fireEvent.click(checkbox(run(3)));
    fireEvent.click(checkbox(run(2)));
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v2 → v3")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(checkbox(run(3))).toBeChecked();
    expect(checkbox(run(2))).toBeChecked();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
  });
});
