import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";

// Poll fast so a run that settles is picked up within the test, not in 2 seconds.
vi.mock("@/components/eval/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/eval/constants")>()),
  EVAL_POLL_MS: 50,
}));

import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "a1", name: "Security Reviewer" } as Agent;

type Json = Record<string, unknown>;

const BASE_EXPECTATION = {
  type: "must_find",
  file: "a.ts",
  start_line: 1,
  end_line: 2,
  title: "t",
  severity: "CRITICAL",
  category: "security",
};

function makeCase(id: string, name: string, over: Json = {}): Json {
  return {
    id,
    owner_kind: "agent",
    owner_id: "a1",
    name,
    finding_id: `f-${id}`,
    input_diff: "+x",
    input_meta: { pr_title: "A PR", pr_description: null },
    expected_output: {
      type: "must_find",
      file: "a.ts",
      start_line: 1,
      end_line: 2,
      title: "t",
      severity: "CRITICAL",
      category: "security",
    },
    created_at: "2026-10-10T10:00:00Z",
    last_result: null,
    ...over,
  };
}

function makeResult(over: Json = {}): Json {
  return {
    case_id: "c1",
    case_name: "n",
    expectation_type: "must_find",
    pass: true,
    matched: 1,
    unjudged: 0,
    kept: 1,
    dropped: 0,
    findings: [],
    duration_ms: 1000,
    cost_usd: 0.01,
    ...over,
  };
}

let runSeq = 0;
function makeRun(over: Json = {}): Json {
  runSeq += 1;
  return {
    id: `r${runSeq}`,
    agent_id: "a1",
    status: "completed",
    ran_at: "2026-10-10T10:00:00Z",
    duration_ms: 1000,
    agent_version: 1,
    model: "gpt-4.1",
    provider: "openai",
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.8,
    traces_passed: 1,
    traces_total: 1,
    cost_usd: 0.01,
    error: null,
    ...over,
  };
}

function makeOverview(cases: Json[], runs: Json[]): Json {
  return {
    agent: { id: "a1", name: "Security Reviewer", model: "gpt-4.1", provider: "openai", version: 1 },
    cases,
    cases_total: cases.length,
    runs,
    runs_total: runs.length,
    trend: [],
  };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** What the fake API answers; tests reassign these. */
let overview: Json;
let overviewResponse: () => Promise<Response>;
const fetchMock = vi.fn();

function requests(method: string, path: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    return ((init as RequestInit | undefined)?.method ?? "GET") === method && new URL(String(url)).pathname === path;
  });
}

beforeEach(() => {
  runSeq = 0;
  overviewResponse = async () => json(overview);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(String(url)).pathname;
    if (method === "GET" && path === "/agents/a1/evals") return overviewResponse();
    if (method === "POST" && path === "/agents/a1/eval-runs") return json(makeRun({ status: "running" }));
    throw new Error(`unexpected ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The tile for a metric: the label's box, which also holds the value and delta. */
function tile(label: string): HTMLElement {
  const labelEl = screen.getAllByText(label).find((el) => el.tagName === "DIV");
  if (!labelEl?.parentElement) throw new Error(`no tile labelled ${label}`);
  return labelEl.parentElement;
}

const nameButton = (name: string) => screen.findByRole("button", { name });

describe("EvalsTab case list", () => {
  it("lists one row per case with its name on one line", async () => {
    overview = makeOverview(
      [makeCase("c1", "SQL injection in login"), makeCase("c2", "A very long case name that must be cut off")],
      [],
    );
    renderTab();

    const first = await nameButton("SQL injection in login");
    const second = await nameButton("A very long case name that must be cut off");
    expect(screen.getAllByRole("button", { name: /^Delete case / })).toHaveLength(2);
    for (const el of [first, second]) {
      expect(el).toHaveStyle({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    }
  });

  it("a must_find row shows severity and category, a must_not_flag row shows must not flag", async () => {
    overview = makeOverview(
      [
        makeCase("c1", "finds it"),
        makeCase("c2", "stays quiet", {
          expected_output: { ...BASE_EXPECTATION, type: "must_not_flag" },
        }),
      ],
      [],
    );
    renderTab();

    expect(await screen.findByText("CRITICAL · security")).toBeInTheDocument();
    expect(screen.getByText("must not flag")).toBeInTheDocument();
  });

  it("a row with a last result shows a pass or fail icon and the expected and got counts", async () => {
    overview = makeOverview(
      [
        makeCase("c1", "passes", { last_result: makeResult({ pass: true, matched: 1 }) }),
        makeCase("c2", "fails", {
          expected_output: { ...BASE_EXPECTATION, type: "must_not_flag" },
          last_result: makeResult({ expectation_type: "must_not_flag", pass: false, matched: 2 }),
        }),
      ],
      [makeRun()],
    );
    const { container } = renderTab();

    expect(await screen.findByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings, got 2")).toBeInTheDocument();
    const statuses = [...container.querySelectorAll("[data-status]")].map((el) => el.getAttribute("data-status"));
    expect(statuses).toEqual(["pass", "fail"]);
  });

  it("a never-run case shows a neutral icon and never run", async () => {
    overview = makeOverview([makeCase("c1", "fresh")], []);
    const { container } = renderTab();

    expect(await screen.findByText("never run")).toBeInTheDocument();
    expect(container.querySelector("[data-status]")?.getAttribute("data-status")).toBe("never");
  });

  it("the badge reads P / T passing", async () => {
    overview = makeOverview(
      [
        makeCase("c1", "a", { last_result: makeResult({ pass: true }) }),
        makeCase("c2", "b", { last_result: makeResult({ pass: false }) }),
        makeCase("c3", "c", { last_result: makeResult({ pass: true }) }),
        makeCase("c4", "d"),
      ],
      [makeRun()],
    );
    renderTab();

    expect(await screen.findByText("2 / 4 passing")).toBeInTheDocument();
  });

  it("no cases: the empty state names accepted or dismissed findings on a pull request and the run control is disabled", async () => {
    overview = makeOverview([], []);
    renderTab();

    expect(await screen.findByText(/accepted or dismissed findings on a pull request/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("loading shows a skeleton in place of the list", () => {
    overviewResponse = () => new Promise<Response>(() => {});
    renderTab();

    expect(screen.getByTestId("evals-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Eval cases")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete case / })).toBeNull();
  });

  it("a failed request shows an error state whose retry refetches", async () => {
    overview = makeOverview([makeCase("c1", "recovered")], []);
    let failing = true;
    overviewResponse = async () => (failing ? json({ error: { message: "boom" } }, 500) : json(overview));
    renderTab();

    expect(await screen.findByText("Could not load the eval cases.")).toBeInTheDocument();
    expect(requests("GET", "/agents/a1/evals")).toHaveLength(1);

    failing = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await nameButton("recovered")).toBeInTheDocument();
    expect(requests("GET", "/agents/a1/evals")).toHaveLength(2);
  });

  it("each row has a delete control", async () => {
    overview = makeOverview([makeCase("c1", "alpha"), makeCase("c2", "beta")], []);
    renderTab();

    expect(await screen.findByRole("button", { name: "Delete case alpha" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete case beta" })).toBeEnabled();
  });
});

describe("EvalsTab metric tiles", () => {
  it("four tiles show the newest completed run's values", async () => {
    overview = makeOverview(
      [makeCase("c1", "a")],
      [makeRun({ recall: 0.83, precision: 0.5, citation_accuracy: 0.9, traces_passed: 4, traces_total: 5 })],
    );
    renderTab();

    await screen.findByRole("button", { name: "Delete case a" });
    expect(within(tile("Recall")).getByText("83%")).toBeInTheDocument();
    expect(within(tile("Precision")).getByText("50%")).toBeInTheDocument();
    expect(within(tile("Citation accuracy")).getByText("90%")).toBeInTheDocument();
    expect(within(tile("Traces passed")).getByText("4/5")).toBeInTheDocument();
  });

  it("with two completed runs each metric tile shows the delta in points with an up or down marker", async () => {
    overview = makeOverview(
      [makeCase("c1", "a")],
      [
        makeRun({ recall: 0.83, precision: 0.5, citation_accuracy: 0.9 }),
        makeRun({ recall: 0.75, precision: 0.6, citation_accuracy: 0.9 }),
      ],
    );
    renderTab();

    await screen.findByRole("button", { name: "Delete case a" });
    expect(within(tile("Recall")).getByText("▲ 8pt")).toBeInTheDocument();
    expect(within(tile("Precision")).getByText("▼ 10pt")).toBeInTheDocument();
    const flat = within(tile("Citation accuracy"));
    expect(flat.getByText("0pt")).toBeInTheDocument();
    expect(flat.queryByText(/[▲▼]/)).toBeNull();
    expect(within(tile("Traces passed")).queryByText(/pt$/)).toBeNull();
  });

  it("no completed run: all four tiles show — and no delta", async () => {
    overview = makeOverview([makeCase("c1", "a")], []);
    renderTab();

    await screen.findByRole("button", { name: "Delete case a" });
    for (const label of ["Recall", "Precision", "Citation accuracy", "Traces passed"]) {
      expect(within(tile(label)).getByText("—")).toBeInTheDocument();
    }
    expect(screen.queryByText(/pt$/)).toBeNull();
  });

  it("a null metric shows — with no delta", async () => {
    overview = makeOverview(
      [makeCase("c1", "a")],
      [makeRun({ recall: null, precision: 0.5 }), makeRun({ recall: 0.7, precision: 0.4 })],
    );
    renderTab();

    await screen.findByRole("button", { name: "Delete case a" });
    const recall = within(tile("Recall"));
    expect(recall.getByText("—")).toBeInTheDocument();
    expect(recall.queryByText(/pt$/)).toBeNull();
    expect(within(tile("Precision")).getByText("▲ 10pt")).toBeInTheDocument();
  });
});

describe("EvalsTab run control", () => {
  it("Run all evals posts to /agents/:id/eval-runs", async () => {
    overview = makeOverview([makeCase("c1", "a")], []);
    renderTab();

    const button = await screen.findByRole("button", { name: "Run all evals" });
    expect(requests("POST", "/agents/a1/eval-runs")).toHaveLength(0);
    fireEvent.click(button);

    await waitFor(() => expect(requests("POST", "/agents/a1/eval-runs")).toHaveLength(1));
  });

  it("during a run the run control is disabled and reads Running…, and the delete controls are disabled", async () => {
    overview = makeOverview(
      [makeCase("c1", "alpha"), makeCase("c2", "beta")],
      [makeRun({ status: "running", recall: null, precision: null, citation_accuracy: null, traces_passed: null })],
    );
    renderTab();

    expect(await screen.findByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Run all evals" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete case alpha" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete case beta" })).toBeDisabled();
  });

  it("when the polled run completes the tiles and the row results update", async () => {
    const running = makeRun({
      id: "rr",
      status: "running",
      recall: null,
      precision: null,
      citation_accuracy: null,
      traces_passed: null,
    });
    overview = makeOverview([makeCase("c1", "alpha")], [running]);
    renderTab();

    await screen.findByRole("button", { name: "Running…" });
    expect(within(tile("Recall")).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();

    overview = makeOverview(
      [makeCase("c1", "alpha", { last_result: makeResult({ pass: true, matched: 1 }) })],
      [{ ...running, status: "completed", recall: 0.83, precision: 0.5, citation_accuracy: 0.9, traces_passed: 1 }],
    );

    await waitFor(() => expect(within(tile("Recall")).getByText("83%")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument());
    expect(screen.queryByText("never run")).toBeNull();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("a failed newest run shows its error beside the run control", async () => {
    overview = makeOverview(
      [makeCase("c1", "alpha")],
      [makeRun({ status: "failed", error: "Provider quota exceeded", recall: null, precision: null, citation_accuracy: null, traces_passed: null })],
    );
    renderTab();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Eval run failed: Provider quota exceeded");
    expect(within(alert.parentElement!).getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("View full dashboard links to /eval/<agent id>", async () => {
    overview = makeOverview([makeCase("c1", "a")], []);
    renderTab();

    const link = await screen.findByRole("link", { name: /View full dashboard/ });
    expect(link).toHaveAttribute("href", "/eval/a1");
  });
});

describe("EvalsTab Recent runs", () => {
  it("Recent runs lists the 5 newest runs with the seven columns and no checkbox or Compare control", async () => {
    const runs = [7, 6, 5, 4, 3, 2, 1].map((v) => makeRun({ agent_version: v }));
    overview = makeOverview([makeCase("c1", "a")], runs);
    renderTab();

    await screen.findByRole("heading", { name: "Recent runs" });
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]);

    const [, ...body] = screen.getAllByRole("row");
    expect(body.map((r) => (r as HTMLTableRowElement).cells[1]?.textContent)).toEqual(["v7", "v6", "v5", "v4", "v3"]);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /compare/i })).toBeNull();
  });

  it("no run: No runs yet replaces the Recent runs list", async () => {
    overview = makeOverview([makeCase("c1", "a")], []);
    renderTab();

    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
