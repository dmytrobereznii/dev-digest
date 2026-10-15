import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAgentEvals,
  useRunEvals,
  useCreateEvalCase,
  useDeleteEvalCase,
} from "./evals";

const fetchMock = vi.fn();

function runSummary(status: "running" | "completed", id = "r1") {
  return {
    id, agent_id: "a1", status, ran_at: "2026-10-10T10:00:00Z", duration_ms: null,
    agent_version: 1, model: "m", provider: "openai", recall: null, precision: null,
    citation_accuracy: null, traces_passed: null, traces_total: 1, cost_usd: null, error: null,
  };
}
function overview(status?: "running" | "completed") {
  return {
    agent: { id: "a1", name: "A", model: "m", provider: "openai", version: 1 },
    cases: [], cases_total: 0, runs: status ? [runSummary(status)] : [], runs_total: status ? 1 : 0, trend: [],
  };
}
function evalCase() {
  return {
    id: "c1", owner_kind: "agent", owner_id: "a1", name: "n", finding_id: "f1", input_diff: "",
    input_meta: { pr_title: "t", pr_description: null },
    expected_output: {
      type: "must_find", file: "a.ts", start_line: 1, end_line: 2, title: "t",
      severity: "WARNING", category: "bug",
    },
    created_at: "2026-10-10T10:00:00Z", last_result: null,
  };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children);
}
/** [method, path, parsed body] for every request made. */
function calls() {
  return fetchMock.mock.calls.map(([url, init]) => {
    const i = init as RequestInit | undefined;
    return [i?.method ?? "GET", new URL(String(url)).pathname, i?.body ? JSON.parse(i.body as string) : undefined];
  });
}
const count = (method: string, path: string) =>
  calls().filter(([m, p]) => m === method && p === path).length;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("eval hooks", () => {
  it("useAgentEvals reads GET /agents/:id/evals and never posts", async () => {
    fetchMock.mockImplementation(async () => json(overview("completed")));
    const { result } = renderHook(() => useAgentEvals("a1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls()).toEqual([["GET", "/agents/a1/evals", undefined]]);
  });

  it(
    "while the newest run is running the overview is read again within 5 seconds, and not after it completes",
    async () => {
      let status: "running" | "completed" = "running";
      fetchMock.mockImplementation(async () => json(overview(status)));
      const { result } = renderHook(() => useAgentEvals("a1"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(count("GET", "/agents/a1/evals")).toBe(1);

      // polled again while running
      await waitFor(() => expect(count("GET", "/agents/a1/evals")).toBeGreaterThanOrEqual(2), {
        timeout: 5000,
      });

      status = "completed";
      await waitFor(() => expect(result.current.data?.runs[0]?.status).toBe("completed"), {
        timeout: 5000,
      });
      const settled = count("GET", "/agents/a1/evals");
      await new Promise((r) => setTimeout(r, 2600));
      expect(count("GET", "/agents/a1/evals")).toBe(settled);
    },
    15000,
  );

  it("useRunEvals posts once to /agents/:id/eval-runs and refreshes the agent's overview", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "POST" ? json(runSummary("running")) : json(overview()),
    );
    const { result } = renderHook(() => ({ ev: useAgentEvals("a1"), run: useRunEvals("a1") }), { wrapper });
    await waitFor(() => expect(result.current.ev.isSuccess).toBe(true));

    await act(async () => {
      await result.current.run.mutateAsync();
    });
    expect(count("POST", "/agents/a1/eval-runs")).toBe(1);
    await waitFor(() => expect(count("GET", "/agents/a1/evals")).toBe(2));
  });

  it("useCreateEvalCase posts the finding id and refreshes every reviews query", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json(evalCase());
      return json({ ok: true });
    });
    qc.setQueryData(["reviews", "pr1"], []);
    qc.setQueryData(["reviews", "pr2"], []);
    const { result } = renderHook(() => useCreateEvalCase(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("f1");
    });
    expect(calls().filter(([m]) => m === "POST")).toEqual([
      ["POST", "/findings/f1/eval-case", { finding_id: "f1" }],
    ]);
    expect(qc.getQueryState(["reviews", "pr1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["reviews", "pr2"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["agent-evals"])).toBeUndefined();
  });

  it("useDeleteEvalCase sends DELETE and refreshes the overview and the reviews queries", async () => {
    fetchMock.mockImplementation(async () => json({ ok: true }));
    qc.setQueryData(["reviews", "pr1"], []);
    qc.setQueryData(["agent-evals", "a1"], overview());
    qc.setQueryData(["agent-evals", "other"], overview());
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1");
    });
    expect(calls()).toEqual([["DELETE", "/eval-cases/c1", undefined]]);
    expect(qc.getQueryState(["reviews", "pr1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["agent-evals", "a1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["agent-evals", "other"])?.isInvalidated).toBe(false);
  });

  it("a failed mutation rejects with the API's message", async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: "conflict", message: "Case already exists" } }, 409),
    );
    const create = renderHook(() => useCreateEvalCase(), { wrapper });
    await act(async () => {
      await expect(create.result.current.mutateAsync("f1")).rejects.toThrow("Case already exists");
    });

    fetchMock.mockImplementation(async () =>
      json({ error: { code: "not_found", message: "No such case" } }, 404),
    );
    const del = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    await act(async () => {
      await expect(del.result.current.mutateAsync("c9")).rejects.toThrow("No such case");
    });
  });
});
