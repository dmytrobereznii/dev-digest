import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";
import { eval as evalMessages } from "@/test/messages";

// The Evals tab reads these; one case with a recognisable name proves its body rendered.
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvals: () => ({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      cases: [
        {
          id: "c1",
          name: "Evals tab body marker",
          input_diff: "",
          input_meta: { pr_title: "t", pr_description: null },
          expected_output: {
            type: "must_find",
            file: "a.ts",
            start_line: 1,
            end_line: 2,
            title: "t",
            severity: "CRITICAL",
            category: "bug",
          },
          last_result: null,
        },
      ],
      cases_total: 1,
      runs: [],
      trend: [],
    },
  }),
  useRunEvals: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("AgentEditor tabs", () => {
  it("shows a Context tab after Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    const skills = labels.indexOf("Skills");
    expect(skills).toBeGreaterThanOrEqual(0);
    expect(labels[skills + 1]).toBe("Context");
  });

  it("the Evals tab is offered and renders the Evals tab body when selected", () => {
    const onTab = vi.fn();
    const { rerender } = renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);

    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledWith("evals");
    expect(screen.queryByText("Evals tab body marker")).toBeNull();
    expect(screen.getByText("Save agent")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
        <ToastProvider>
          <AgentEditor agent={AGENT} tab="evals" onTab={onTab} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Evals tab body marker")).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).toBeNull();
  });
});
