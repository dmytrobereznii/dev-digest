import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
const repoState: { activeRepo: { id: string; full_name: string } | null } = { activeRepo: null };
const AGENT = { id: "a1", name: "General", provider: "openai", model: "gpt-4o", enabled: true };
const searchState = { query: "" };

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "a1" }),
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchState.query),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/AgentEditor", () => ({
  AgentEditor: ({ tab, onTab }: { tab: string; onTab: (t: string) => void }) => (
    <button data-testid="editor" data-tab={tab} onClick={() => onTab("evals")} />
  ),
}));
vi.mock("../_components/AgentCard", () => ({ AgentCard: () => <div /> }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [AGENT] }),
  useAgent: () => ({ data: AGENT, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: repoState.activeRepo }),
}));

import AgentEditorPage from "./page";

beforeEach(() => {
  repoState.activeRepo = null;
  searchState.query = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The button label is a literal in page.tsx (no message key exists for it).
const RUN_ON_PR = /Run on a PR/;

describe("AgentEditorPage", () => {
  it("Run on a PR opens the active repository's pull list", () => {
    repoState.activeRepo = { id: "r2", full_name: "acme/second" };
    render(<AgentEditorPage />);

    fireEvent.click(screen.getByRole("button", { name: RUN_ON_PR }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/r2/pulls");
  });

  it("Run on a PR falls back to the root page with no active repository", () => {
    render(<AgentEditorPage />);

    fireEvent.click(screen.getByRole("button", { name: RUN_ON_PR }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("?tab=evals selects the Evals tab", () => {
    searchState.query = "tab=evals";
    render(<AgentEditorPage />);

    expect(screen.getByTestId("editor")).toHaveAttribute("data-tab", "evals");
  });

  it("an unknown ?tab= falls back to the Config tab", () => {
    searchState.query = "tab=nope";
    render(<AgentEditorPage />);

    expect(screen.getByTestId("editor")).toHaveAttribute("data-tab", "config");
  });

  it("choosing the Evals tab writes ?tab=evals to the URL", () => {
    render(<AgentEditorPage />);

    fireEvent.click(screen.getByTestId("editor"));

    expect(replace).toHaveBeenCalledWith("/agents/a1?tab=evals");
  });
});
