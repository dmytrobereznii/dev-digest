import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "@/../messages/en/conventions.json";

/* `state` is mutated per test, so the mocked hooks read it lazily. */
const state: { candidates: ConventionCandidate[] } = { candidates: [] };
const setAllMutate = vi.fn();
const setStatusMutate = vi.fn();

/* AppShell is stubbed: it pulls the whole @devdigest/ui shell, the command
   palette and the repo switcher, none of which this test is about. */
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
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: {
      scan: { id: "s1", sample_count: 84, model: "anthropic/claude-haiku-4.5", created_at: new Date().toISOString() },
      candidates: state.candidates,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useExtractConventions: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSetConventionStatus: () => ({ mutate: setStatusMutate, isPending: false, variables: undefined }),
  useSetAllConventionStatus: () => ({ mutate: setAllMutate, isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

function candidate(id: string, accepted: boolean): ConventionCandidate {
  return {
    id,
    rule: `Rule ${id}`,
    evidence_path: `src/${id}.ts:1-3`,
    evidence_snippet: `const ${id} = 1;`,
    confidence: 0.9,
    accepted,
    status: accepted ? "accepted" : "pending",
  };
}

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.candidates = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConventionsView", () => {
  /* The artboard's own affordance: with nothing accepted there is nothing to
     merge, so Create skill dims rather than disappearing. */
  it("disables Create skill until something is accepted", () => {
    state.candidates = [candidate("c1", false), candidate("c2", false)];
    renderView();

    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    expect(screen.getByText("0 of 2 accepted")).toBeInTheDocument();

    cleanup();
    state.candidates = [candidate("c1", true), candidate("c2", false)];
    renderView();

    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("flips the toolbar toggle between Accept all and Deselect all", () => {
    state.candidates = [candidate("c1", true), candidate("c2", false)];
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(setAllMutate).toHaveBeenCalledWith({ repoId: "r1", status: "accepted" });

    cleanup();
    state.candidates = [candidate("c1", true), candidate("c2", true)];
    renderView();

    expect(screen.queryByRole("button", { name: "Accept all" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(setAllMutate).toHaveBeenCalledWith({ repoId: "r1", status: "pending" });
  });

  /* D4 — a scan that grounded nothing keeps its header, so "last scan" stays
     true. Falling back to the empty state would claim it never ran. */
  it("keeps the header and shows a zero count when a scan grounded nothing", () => {
    renderView();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
    expect(screen.getByText("Detected from 84 sample files · last scan just now")).toBeInTheDocument();
    expect(screen.getByText("0 candidates · grounded against sampled files")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });
});
