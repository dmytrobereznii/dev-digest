import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "@/../messages/en/agents.json";

const mutate = vi.fn();
let links: AgentSkillLink[] = [];

function skill(id: string, name: string): Skill {
  return {
    id,
    name,
    description: `${name} description`,
    type: "custom",
    source: "manual",
    body: "# Body",
    enabled: true,
    version: 1,
  };
}

// Deliberately out of alphabetical order: unlinked rows sort by name, linked
// rows by their link `order`.
const SKILLS: Skill[] = [
  skill("s1", "pr-quality-rubric"),
  skill("s2", "api-contract-gate"),
  skill("s3", "test-coverage-nudge"),
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: links }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  links = [
    { agent_id: "ag1", skill_id: "s3", order: 0 },
    { agent_id: "ag1", skill_id: "s1", order: 1 },
  ];
});
afterEach(cleanup);

describe("Agent editor — Skills tab", () => {
  it("checks a skill by POSTing the whole ordered set with it appended", () => {
    renderTab();
    // Linked first in link order, then the unlinked one.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual([
      "test-coverage-nudge",
      "pr-quality-rubric",
      "api-contract-gate",
    ]);

    fireEvent.click(screen.getByRole("checkbox", { name: "api-contract-gate" }));
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s3", "s1", "s2"] });
  });

  it("unchecks a skill while a filter hides the rest — the payload is still the full ordered set", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), {
      target: { value: "test-coverage" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "test-coverage-nudge" }));
    // s1 is filtered out of the view but must not be unlinked by the edit.
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s1"] });
  });

  it("moves a linked skill down through the same whole-set call", () => {
    renderTab();
    // Only the first linked row offers ↓ and only the last offers ↑, so each
    // arrow is unique: the ↓ belongs to `test-coverage-nudge` (order 0).
    fireEvent.click(screen.getByRole("button", { name: messages.skills.moveDown }));
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s1", "s3"] });
  });
});
