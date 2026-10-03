import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefRecord, PrBriefResponse } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "./brief";

const PR_ID = "11111111-1111-4111-8111-111111111111";

function makeBrief(summary: string): PrBriefRecord {
  return {
    summary,
    intent: null,
    blast: null,
    risks: { risks: [] },
    review_focus: [],
    history: { history: [] },
    pr_id: PR_ID,
    head_sha: "abc123",
    generated_at: "2026-10-03T10:00:00.000Z",
    model: "anthropic/claude-haiku-4.5",
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.002,
    missing_inputs: [],
    specs_used: [],
    dropped: { risks: 0, review_focus: 0 },
    stale: false,
  };
}

const fetchMock = vi.fn();
let qc: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** [method, path] for every request made. */
function calls() {
  return fetchMock.mock.calls.map(([url, init]) => [
    (init as RequestInit | undefined)?.method ?? "GET",
    new URL(String(url)).pathname,
  ]);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  qc.clear();
});

describe("brief hooks", () => {
  it("usePrBrief reads GET /pulls/:id/brief and never posts", async () => {
    const body: PrBriefResponse = { brief: makeBrief("Stored."), generating: false };
    fetchMock.mockImplementation(async () => json(body));

    const { result } = renderHook(() => usePrBrief(PR_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.brief?.summary).toBe("Stored.");
    expect(calls()).toEqual([["GET", `/pulls/${PR_ID}/brief`]]);
  });

  it("useGenerateBrief posts once and writes the returned brief into the cache", async () => {
    fetchMock.mockImplementation(async () => json(makeBrief("Fresh.")));
    qc.setQueryData(["pr-brief", PR_ID], { brief: null, generating: false });

    const { result } = renderHook(() => useGenerateBrief(PR_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(calls()).toEqual([["POST", `/pulls/${PR_ID}/brief`]]);
    const cached = qc.getQueryData<PrBriefResponse>(["pr-brief", PR_ID]);
    expect(cached?.brief?.summary).toBe("Fresh.");
    expect(cached?.generating).toBe(false);
  });

  it("while a read reports generating the brief is read again within 4 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => json({ brief: null, generating: true }));

    renderHook(() => usePrBrief(PR_ID), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("a read that is not generating is not polled", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => json({ brief: null, generating: false }));

    renderHook(() => usePrBrief(PR_ID), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed generation leaves the cached brief unchanged", async () => {
    const before: PrBriefResponse = { brief: makeBrief("Before."), generating: false };
    qc.setQueryData(["pr-brief", PR_ID], before);
    fetchMock.mockImplementation(async () =>
      json({ error: { code: "llm_failed", message: "Model unavailable" } }, 502),
    );

    const { result } = renderHook(() => useGenerateBrief(PR_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Model unavailable");
    expect(qc.getQueryData(["pr-brief", PR_ID])).toEqual(before);
  });
});
