import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";
import { EvalsTab } from "../../EvalsTab";

const AGENT = { id: "a1", name: "Security Reviewer" } as Agent;

type Json = Record<string, unknown>;

function makeCase(id: string, name: string): Json {
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
  };
}

function makeOverview(cases: Json[]): Json {
  return {
    agent: { id: "a1", name: "Security Reviewer", model: "gpt-4.1", provider: "openai", version: 1 },
    cases,
    cases_total: cases.length,
    runs: [],
    runs_total: 0,
    trend: [],
  };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

let cases: Json[];
let deleteResponse: (id: string) => Response;
const fetchMock = vi.fn();

function requests(method: string, path?: string) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const m = (init as RequestInit | undefined)?.method ?? "GET";
    return m === method && (path === undefined || new URL(String(url)).pathname === path);
  });
}

beforeEach(() => {
  cases = [makeCase("c1", "alpha"), makeCase("c2", "beta")];
  deleteResponse = (id) => {
    cases = cases.filter((c) => c.id !== id);
    return json({ ok: true });
  };
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(String(url)).pathname;
    if (method === "GET" && path === "/agents/a1/evals") return json(makeOverview(cases));
    const del = path.match(/^\/eval-cases\/(.+)$/);
    if (method === "DELETE" && del) return deleteResponse(del[1] ?? "");
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

async function openDeleteFor(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Delete case ${name}` }));
  return screen.findByRole("dialog");
}

describe("DeleteCaseDialog", () => {
  it("the delete control opens a confirmation naming the case, sends nothing and does not open the case modal", async () => {
    renderTab();
    const dialog = await openDeleteFor("alpha");

    expect(dialog).toHaveTextContent("Delete eval case alpha?");
    expect(screen.getByRole("button", { name: "Delete case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(requests("DELETE")).toHaveLength(0);
    // Only the confirmation is open: the case modal's heading is absent.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByText("Eval case · alpha")).toBeNull();
  });

  it("cancel keeps the row and sends no request", async () => {
    renderTab();
    await openDeleteFor("alpha");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "alpha" })).toBeInTheDocument();
    expect(requests("DELETE")).toHaveLength(0);
  });

  it("confirm sends DELETE and the row is gone after the refetch", async () => {
    renderTab();
    await openDeleteFor("alpha");

    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));

    await waitFor(() => expect(requests("DELETE", "/eval-cases/c1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "alpha" })).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "beta" })).toBeInTheDocument();
    expect(requests("DELETE")).toHaveLength(1);
  });

  it("a failed delete shows the API's message and keeps the row", async () => {
    deleteResponse = () => json({ error: { code: "conflict", message: "Case is locked by a running eval" } }, 409);
    renderTab();
    await openDeleteFor("alpha");

    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Case is locked by a running eval");
    expect(screen.getByRole("button", { name: "alpha" })).toBeInTheDocument();
    expect(requests("DELETE")).toHaveLength(1);
  });
});
