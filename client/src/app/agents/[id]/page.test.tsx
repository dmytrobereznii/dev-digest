import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
const repoState: { activeRepo: { id: string; full_name: string } | null } = { activeRepo: null };
const AGENT = { id: "a1", name: "General", provider: "openai", model: "gpt-4o", enabled: true };

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "a1" }),
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/AgentEditor", () => ({ AgentEditor: () => <div /> }));
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
});
