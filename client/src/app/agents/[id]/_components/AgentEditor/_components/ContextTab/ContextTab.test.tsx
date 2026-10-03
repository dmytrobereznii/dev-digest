import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import agents from "@/../messages/en/agents.json";
import { context } from "@/test/messages";

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async (p: string) =>
      p.startsWith("/repos/")
        ? {
            status: "ok",
            pattern: "specs/**/*.md",
            documents: [
              { path: "specs/a.md", type: "specs", tokens: 10, used_by_agents: 1 },
              { path: "specs/b.md", type: "specs", tokens: 20, used_by_agents: 0 },
              { path: "docs/c.md", type: "docs", tokens: 30, used_by_agents: 0 },
            ],
          }
        : // one attached path still listed, one that no longer is
          { paths: ["specs/a.md", "specs/removed.md"] },
    ),
  },
}));

import { ContextTab } from "./ContextTab";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents, context }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("agent ContextTab", () => {
  it("heading Project context with N of M attached", async () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    // N counts only attached documents found in the repository (1, not 2); M is all found (3).
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
  });

  it("states that documents are injected as an untrusted Project context block", () => {
    renderTab();
    expect(
      screen.getByText(
        /injected as an untrusted ## Project context block into runs on the active repository’s pull requests/,
      ),
    ).toBeInTheDocument();
  });
});
