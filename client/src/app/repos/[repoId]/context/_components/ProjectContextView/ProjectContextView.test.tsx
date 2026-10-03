import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocumentList } from "@devdigest/shared";
import { context } from "@/test/messages";

interface ListState {
  data: ProjectDocumentList | undefined;
  isLoading: boolean;
  isError: boolean;
}
const list: ListState = { data: undefined, isLoading: false, isError: false };
const refetch = vi.fn();
const contentFor: Record<string, string> = {};

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  notFound: vi.fn(),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocuments: () => ({ ...list, refetch, isFetching: false }),
  useProjectDocumentContent: (_repo: string, path: string) => ({
    data: { path, content: contentFor[path] ?? "", tokens: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ProjectContextView } from "./ProjectContextView";

const DOCS: ProjectDocumentList = {
  status: "ok",
  pattern: "docs/**/*.md",
  documents: [
    { path: "docs/guide.md", type: "docs", tokens: 120, used_by_agents: 3 },
    { path: "specs/auth.md", type: "specs", tokens: 80, used_by_agents: 1 },
  ],
};

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  list.data = DOCS;
  list.isLoading = false;
  list.isError = false;
  contentFor["docs/guide.md"] = "# Guide heading\n\nBody text";
  contentFor["specs/auth.md"] = "Auth spec body";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectContextView", () => {
  it("lists every document with its path and type badge", () => {
    renderView();

    const rows = within(screen.getByRole("list", { name: context.listLabel })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    // File name on the first line, directory beneath, full path in the title.
    expect(within(rows[0]!).getByTitle("docs/guide.md")).toBeTruthy();
    expect(within(rows[0]!).getByText("guide.md")).toBeTruthy();
    expect(within(rows[0]!).getByText("docs")).toBeTruthy();
    expect(within(rows[0]!).getByText(context.type.docs)).toBeTruthy();
    expect(within(rows[1]!).getByTitle("specs/auth.md")).toBeTruthy();
    expect(within(rows[1]!).getByText("auth.md")).toBeTruthy();
    expect(within(rows[1]!).getByText("specs")).toBeTruthy();
    expect(within(rows[1]!).getByText(context.type.specs)).toBeTruthy();
    expect(screen.getByRole("button", { name: context.refresh })).toBeTruthy();
    expect(screen.getByText("docs/**/*.md")).toBeTruthy();
  });

  it("opens with the first document selected, and a click changes it", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Guide heading" })).toBeTruthy();
    expect(screen.getByText("Body text")).toBeTruthy();

    fireEvent.click(screen.getByTitle("specs/auth.md"));

    expect(screen.getByText("Auth spec body")).toBeTruthy();
    expect(screen.queryByText("Body text")).toBeNull();
  });

  it("shows Used by N agents for the selected document", () => {
    renderView();
    expect(screen.getByText("Used by 3 agents")).toBeTruthy();

    fireEvent.click(screen.getByTitle("specs/auth.md"));
    expect(screen.getByText("Used by 1 agent")).toBeTruthy();
  });

  it("refresh reloads the list", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: context.refresh }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state", () => {
    list.data = undefined;
    list.isLoading = true;
    renderView();

    expect(screen.queryByRole("list", { name: context.listLabel })).toBeNull();
    expect(screen.queryByText(context.loadError)).toBeNull();
    expect(screen.queryByText(context.empty.title)).toBeNull();
    expect(screen.getByRole("status", { name: context.loading })).toBeTruthy();
  });

  it("shows the error in place of the list", () => {
    list.data = undefined;
    list.isError = true;
    renderView();

    expect(screen.getByText(context.loadError)).toBeTruthy();
    expect(screen.queryByRole("list", { name: context.listLabel })).toBeNull();
  });

  it("the empty state names the search pattern", () => {
    list.data = { status: "ok", pattern: "docs/**/*.md", documents: [] };
    renderView();

    expect(screen.getByText(context.empty.title)).toBeTruthy();
    expect(screen.getByText(/docs\/\*\*\/\*\.md/)).toBeTruthy();
    expect(screen.queryByText(context.notCloned.title)).toBeNull();
  });

  it("says the repository is not cloned", () => {
    list.data = { status: "not_cloned", pattern: "docs/**/*.md", documents: [] };
    renderView();

    expect(screen.getByText(context.notCloned.title)).toBeTruthy();
    expect(screen.queryByText(context.empty.title)).toBeNull();
  });
});
