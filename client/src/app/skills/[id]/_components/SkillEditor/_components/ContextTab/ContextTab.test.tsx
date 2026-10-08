import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import skills from "@/../messages/en/skills.json";
import { context } from "@/test/messages";

const server = vi.hoisted(() => ({ attached: [] as string[] }));

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async (p: string) =>
      p.startsWith("/repos/")
        ? {
            status: "ok",
            pattern: "specs/**/*.md",
            documents: [
              { path: "specs/a.md", type: "specs", tokens: 10, used_by_agents: 0 },
              { path: "specs/b.md", type: "specs", tokens: 20, used_by_agents: 0 },
            ],
          }
        : { paths: [...server.attached] },
    ),
  },
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "rubric" } as Skill;

beforeEach(() => {
  server.attached = [];
});
afterEach(cleanup);

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills, context }}>
        <ContextTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("skill ContextTab", () => {
  it("heading Project context to use with N attached", async () => {
    server.attached = ["specs/b.md", "specs/a.md"];
    renderTab();
    expect(screen.getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(await screen.findByText("2 attached")).toBeInTheDocument();
  });

  it("shows the inherit sentence", () => {
    renderTab();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
  });

  it("Serializes as lists attached paths in order, and is absent with none", async () => {
    server.attached = ["specs/b.md", "specs/a.md"];
    const { unmount } = renderTab();
    const label = await screen.findByText("Serializes as");
    const box = label.nextElementSibling as HTMLElement;
    expect(box.textContent).toBe("## Project specifications\n- specs/b.md\n- specs/a.md");
    unmount();

    server.attached = [];
    renderTab();
    await screen.findByText("0 attached");
    await waitFor(() => expect(screen.queryByText("Serializes as")).not.toBeInTheDocument());
  });
});
