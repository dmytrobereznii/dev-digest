import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const replace = vi.fn();
const push = vi.fn();
const REPOS = [
  { id: "r1", full_name: "acme/first" },
  { id: "r2", full_name: "acme/second" },
];
const repoState: { activeRepo: (typeof REPOS)[number] | null } = { activeRepo: null };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: REPOS, isLoading: false, isError: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: repoState.activeRepo }),
}));

import HomePage from "./page";

beforeEach(() => {
  repoState.activeRepo = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HomePage", () => {
  it("redirects to the selected repository's pull list", () => {
    repoState.activeRepo = REPOS[1]!;
    render(<HomePage />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/repos/r2/pulls");
  });

  it("falls back to the first repository when none is selected", () => {
    render(<HomePage />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls");
  });
});
