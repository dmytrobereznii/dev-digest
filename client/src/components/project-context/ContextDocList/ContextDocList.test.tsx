import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectDocumentList } from "@devdigest/shared";
import { context } from "@/test/messages";

// A tiny fake API: the real hooks run against it, so attach/detach, cache
// invalidation and the token total are exercised end to end.
const server = vi.hoisted(() => ({
  list: null as unknown,
  attached: [] as string[],
  content: "" as string,
  calls: [] as string[],
}));
const repo = vi.hoisted(() => ({ repoId: "r1" as string | null }));

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: repo.repoId }) }));
vi.mock("@/lib/api", () => {
  const url = (p: string) => new URL(p, "http://x");
  return {
    api: {
      get: vi.fn(async (p: string) => {
        server.calls.push(`GET ${p}`);
        if (p.includes("/context/content")) return { path: "", content: server.content, tokens: 1 };
        if (p.startsWith("/repos/")) return server.list;
        return { paths: [...server.attached] };
      }),
      post: vi.fn(async (p: string, body: { path: string }) => {
        server.calls.push(`POST ${p} ${JSON.stringify(body)}`);
        server.attached.push(body.path);
        return { paths: [...server.attached] };
      }),
      del: vi.fn(async (p: string) => {
        server.calls.push(`DELETE ${p}`);
        const path = url(p).searchParams.get("path");
        server.attached = server.attached.filter((x) => x !== path);
        return { paths: [...server.attached] };
      }),
    },
  };
});

import { ContextDocList } from "./ContextDocList";

const LIST: ProjectDocumentList = {
  status: "ok",
  pattern: "specs/**/*.md",
  documents: [
    { path: "specs/auth.md", type: "specs", tokens: 100, used_by_agents: 0 },
    { path: "docs/guide/setup.md", type: "docs", tokens: 25, used_by_agents: 0 },
  ],
};

beforeEach(() => {
  server.list = LIST;
  server.attached = [];
  server.content = "# Auth spec\n\nSecret body text.";
  server.calls = [];
  repo.repoId = "r1";
});
afterEach(cleanup);

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ContextDocList owner="agents" ownerId="ag1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const total = (n: number) => `≈ ${n} tokens`;

describe("ContextDocList", () => {
  it("each row has a checkbox, file name, directory, type badge and Preview", async () => {
    renderList();
    const row = (await screen.findByRole("checkbox", { name: "setup.md" })).closest(
      '[role="listitem"]',
    ) as HTMLElement;
    expect(within(row).getByText("setup.md")).toBeInTheDocument();
    expect(within(row).getByText("docs/guide")).toBeInTheDocument();
    expect(within(row).getByText(context.type.docs)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: context.list.preview })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "auth.md" })).not.toBeChecked();
  });

  it("checking a document attaches it for the active repository", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("checkbox", { name: "auth.md" }));
    await waitFor(() =>
      expect(server.calls).toContain(
        `POST /agents/ag1/context ${JSON.stringify({ repo_id: "r1", path: "specs/auth.md" })}`,
      ),
    );
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "auth.md" })).toBeChecked());
  });

  it("unchecking a document detaches it", async () => {
    server.attached = ["specs/auth.md"];
    renderList();
    const box = await screen.findByRole("checkbox", { name: "auth.md" });
    await waitFor(() => expect(box).toBeChecked());
    fireEvent.click(box);
    await waitFor(() =>
      expect(server.calls).toContain(
        `DELETE /agents/ag1/context?repo_id=r1&path=${encodeURIComponent("specs/auth.md")}`,
      ),
    );
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it("the filter narrows rows by path", async () => {
    renderList();
    await screen.findByRole("checkbox", { name: "auth.md" });
    fireEvent.change(screen.getByPlaceholderText(context.list.filterPlaceholder), {
      target: { value: "GUIDE/" },
    });
    expect(screen.queryByRole("checkbox", { name: "auth.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "setup.md" })).toBeInTheDocument();
  });

  it("Preview shows the document content read-only", async () => {
    renderList();
    await screen.findByRole("checkbox", { name: "auth.md" });
    const row = screen.getByRole("checkbox", { name: "auth.md" }).closest(
      '[role="listitem"]',
    ) as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: context.list.preview }));
    expect(await screen.findByRole("heading", { name: "Auth spec" })).toBeInTheDocument();
    expect(screen.getByText("Secret body text.")).toBeInTheDocument();
    expect(server.calls.some((c) => c.includes("/context/content?path=specs%2Fauth.md"))).toBe(true);
    expect(screen.queryByRole("textbox", { name: /auth/i })).not.toBeInTheDocument();
  });

  it("the token total follows the checked documents without a reload", async () => {
    renderList();
    expect(await screen.findByText(total(0))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "auth.md" }));
    expect(await screen.findByText(total(100))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "setup.md" }));
    expect(await screen.findByText(total(125))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "auth.md" }));
    expect(await screen.findByText(total(25))).toBeInTheDocument();
  });

  it("an attached path that is no longer listed is marked missing with a detach control", async () => {
    server.attached = ["specs/gone.md"];
    renderList();
    expect(await screen.findByText(context.list.missing)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach gone.md" }));
    await waitFor(() =>
      expect(server.calls).toContain(
        `DELETE /agents/ag1/context?repo_id=r1&path=${encodeURIComponent("specs/gone.md")}`,
      ),
    );
    await waitFor(() => expect(screen.queryByText(context.list.missing)).not.toBeInTheDocument());
  });

  it("asks for a repository when none is active", () => {
    repo.repoId = null;
    renderList();
    expect(screen.getByText(context.list.noRepo.title)).toBeInTheDocument();
    expect(screen.getByText(context.list.noRepo.body)).toBeInTheDocument();
  });

  it("says the repository is not cloned", async () => {
    server.list = { status: "not_cloned", pattern: "specs/**/*.md", documents: [] };
    renderList();
    expect(await screen.findByText(context.notCloned.title)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
