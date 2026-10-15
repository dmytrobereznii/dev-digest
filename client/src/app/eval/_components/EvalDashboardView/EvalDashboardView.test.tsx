import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunSummary } from "@devdigest/shared";
import { eval as evalMessages, agents } from "@/test/messages";
import { formatRanAt } from "@/components/eval/helpers";

const push = vi.fn();
const refetch = vi.fn();
let hookState: { data?: EvalDashboard; isLoading: boolean; isError: boolean };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/evals", () => ({
  useEvalDashboard: () => ({ ...hookState, refetch }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

const RAN_AT = "2026-10-10T14:32:00Z";

function run(over: Partial<EvalRunSummary> & { agent_name?: string } = {}) {
  return {
    id: "r1", agent_id: "a1", agent_name: "General", status: "completed", ran_at: RAN_AT,
    duration_ms: 1000, agent_version: 3, model: "gpt-x", provider: "openai",
    recall: 0.825, precision: 0.5, citation_accuracy: 1, traces_passed: 3, traces_total: 4,
    cost_usd: 0.0123, error: null, ...over,
  } as EvalRunSummary & { agent_name: string };
}

function agent(over: Partial<EvalDashboard["agents"][number]> = {}) {
  return {
    id: "a1", name: "General", model: "gpt-x", version: 3, cases_total: 4,
    latest_run: run(), recall_trend: [0.2, 0.6], ...over,
  } as EvalDashboard["agents"][number];
}

function renderView(data: EvalDashboard | undefined, state: Partial<typeof hookState> = {}) {
  hookState = { data, isLoading: false, isError: false, ...state };
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, agents }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

const rowButton = (name: string) =>
  screen.getByRole("button", { name: evalMessages.dashboard.agentRow.replace("{name}", name) });

beforeEach(() => {
  push.mockReset();
  refetch.mockReset();
});
afterEach(cleanup);

describe("EvalDashboardView", () => {
  it("lists each agent with name, model, version, run time, P/T pass and the three metrics of its newest completed run", () => {
    renderView({ agents: [agent()], recent_runs: [] });
    const row = within(rowButton("General"));
    expect(row.getByText("General")).toBeInTheDocument();
    expect(row.getByText("gpt-x")).toBeInTheDocument();
    expect(row.getByText(`v3 · ${formatRanAt(RAN_AT)} · 3/4 pass`)).toBeInTheDocument();
    expect(row.getByText("83%")).toBeInTheDocument();
    expect(row.getByText("50%")).toBeInTheDocument();
    expect(row.getByText("100%")).toBeInTheDocument();
  });

  it("draws a recall sparkline from the trend points, nulls left out", () => {
    const { container } = renderView({
      agents: [agent({ recall_trend: [0.2, null, 0.6] })],
      recent_runs: [],
    });
    const path = container.querySelector("button svg path")!;
    expect(path).not.toBeNull();
    // two defined points: one move + one line segment
    expect(path.getAttribute("d")!.match(/[ML]/g)).toEqual(["M", "L"]);
  });

  it("an agent with no completed run shows No runs yet, — for its metrics and no sparkline", () => {
    const { container } = renderView({
      agents: [agent({ latest_run: null, recall_trend: [] })],
      recent_runs: [],
    });
    const row = within(rowButton("General"));
    expect(row.getByText("No runs yet")).toBeInTheDocument();
    expect(row.getAllByText("—")).toHaveLength(3);
    expect(container.querySelector("button svg")).toBeNull();
  });

  it("activating a row opens /eval/<agent id>", () => {
    renderView({ agents: [agent({ id: "agent-9", name: "Security" })], recent_runs: [] });
    fireEvent.click(rowButton("Security"));
    expect(push).toHaveBeenCalledWith("/eval/agent-9");
  });

  it("Recent eval runs · all agents lists runs with the agent's name, time, version, metric bars with a percentage and passed over total", () => {
    const { container } = renderView({
      agents: [],
      recent_runs: [
        run({ id: "r2", agent_name: "Security", agent_version: 5, recall: 0.9, precision: 0.6, citation_accuracy: 0.7, traces_passed: 2, traces_total: 5 }),
        run({ id: "r1", agent_name: "General" }),
      ],
    });
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Agent", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass"]);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText("Security")).toBeInTheDocument();
    expect(first.getByText(formatRanAt(RAN_AT))).toBeInTheDocument();
    expect(first.getByText("v5")).toBeInTheDocument();
    expect(first.getByText("90%")).toBeInTheDocument();
    expect(first.getByText("60%")).toBeInTheDocument();
    expect(first.getByText("70%")).toBeInTheDocument();
    expect(first.getByText("2/5")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("General")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody td [aria-hidden]")).toHaveLength(6);
  });

  it("a running or failed run shows its status in place of the bars", () => {
    const nulls = { recall: null, precision: null, citation_accuracy: null, traces_passed: null };
    const { container } = renderView({
      agents: [],
      recent_runs: [
        run({ id: "a", agent_name: "Alpha", status: "running", ...nulls }),
        run({ id: "b", agent_name: "Beta", status: "failed", ...nulls }),
      ],
    });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Running…")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Failed")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody td [aria-hidden]")).toHaveLength(0);
  });

  it("no agent: the empty state names accepted or dismissed findings on a pull request", () => {
    renderView({ agents: [], recent_runs: [] });
    expect(screen.getByText(/accepted or dismissed findings on a pull request/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("loading shows a skeleton", () => {
    const { container } = renderView(undefined, { isLoading: true });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a failed request shows an error state whose retry refetches", () => {
    renderView(undefined, { isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(evalMessages.dashboard.loadError);
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
