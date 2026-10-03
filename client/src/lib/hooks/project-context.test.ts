import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useProjectDocuments,
  useProjectDocumentContent,
  useContextAttachments,
  useAttachContext,
  useDetachContext,
} from "./project-context";

const fetchMock = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** [method, path-without-origin, parsed body] for every request made. */
function calls() {
  return fetchMock.mock.calls.map(([url, init]) => {
    const u = new URL(String(url));
    return [
      (init as RequestInit | undefined)?.method ?? "GET",
      u.pathname + u.search,
      (init as RequestInit | undefined)?.body
        ? JSON.parse((init as RequestInit).body as string)
        : undefined,
    ];
  });
}

beforeEach(() => {
  // A fresh Response per call: a body can be read only once.
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify({ status: "ok", pattern: "", documents: [], paths: [] }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("project-context hooks", () => {
  it("requests only the Project Context routes the API serves", async () => {
    const list = renderHook(() => useProjectDocuments("r1"), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const content = renderHook(() => useProjectDocumentContent("r1", "docs/a b.md"), { wrapper });
    await waitFor(() => expect(content.result.current.isSuccess).toBe(true));

    for (const owner of ["agents", "skills"] as const) {
      const att = renderHook(() => useContextAttachments(owner, "o1", "r1"), { wrapper });
      await waitFor(() => expect(att.result.current.isSuccess).toBe(true));

      const attach = renderHook(() => useAttachContext(), { wrapper });
      await act(() =>
        attach.result.current.mutateAsync({ owner, ownerId: "o1", repoId: "r1", path: "docs/a.md" }),
      );
      const detach = renderHook(() => useDetachContext(), { wrapper });
      await act(() =>
        detach.result.current.mutateAsync({ owner, ownerId: "o1", repoId: "r1", path: "docs/a.md" }),
      );
    }

    expect(calls()).toEqual([
      ["GET", "/repos/r1/context", undefined],
      ["GET", "/repos/r1/context/content?path=docs%2Fa%20b.md", undefined],
      ["GET", "/agents/o1/context?repo_id=r1", undefined],
      ["POST", "/agents/o1/context", { repo_id: "r1", path: "docs/a.md" }],
      ["DELETE", "/agents/o1/context?repo_id=r1&path=docs%2Fa.md", undefined],
      ["GET", "/skills/o1/context?repo_id=r1", undefined],
      ["POST", "/skills/o1/context", { repo_id: "r1", path: "docs/a.md" }],
      ["DELETE", "/skills/o1/context?repo_id=r1&path=docs%2Fa.md", undefined],
    ]);
  });
});
