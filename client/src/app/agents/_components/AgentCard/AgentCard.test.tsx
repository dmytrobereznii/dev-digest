import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

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
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  /* Delete opens an in-app dialog, not window.confirm — which could not be
     styled, bypassed next-intl, and had no close control. */
  it("shows Delete only when deletable, and opens a dialog with confirm and cancel", () => {
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();

    cleanup();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} deletable />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Security Reviewer" }));

    expect(screen.getByText("Delete “Security Reviewer”?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // Opening the dialog must not also navigate to the agent behind it.
    expect(onClick).not.toHaveBeenCalled();
  });
});
