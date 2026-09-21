import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flag committed credentials and tokens",
  type: "security",
  source: "imported_url",
  body: "# secret-leakage-gate\n\nFlag committed credentials.",
  enabled: false,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders the type pill, the version, the source label and the agent count", () => {
    renderWithIntl(<SkillCard sk={{ ...SKILL, version: 3 }} agentCount={2} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  /* The delete control is opt-in, and opening it must not also fire the card's
     onClick — that would navigate to the skill you are trying to remove. */
  it("shows Delete only when deletable, and opens the dialog without navigating", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard sk={SKILL} agentCount={0} onClick={onClick} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();

    cleanup();
    renderWithIntl(<SkillCard sk={SKILL} agentCount={0} onClick={onClick} deletable />);
    fireEvent.click(screen.getByRole("button", { name: "Delete secret-leakage-gate" }));

    expect(screen.getByText("Delete “secret-leakage-gate”?")).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  /* D2: an untrusted source that nobody has turned on yet is the state the
     vetting step exists for, so the badge is the edge that matters. */
  it("flags a disabled non-manual skill as needing vetting", () => {
    renderWithIntl(<SkillCard sk={SKILL} agentCount={0} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    // No footer rule when nothing links it (D7).
    expect(screen.queryByText(/agents?$/)).not.toBeInTheDocument();
  });

  it("does not flag a manual skill, enabled or not", () => {
    renderWithIntl(<SkillCard sk={{ ...SKILL, source: "manual", enabled: false }} agentCount={0} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});
