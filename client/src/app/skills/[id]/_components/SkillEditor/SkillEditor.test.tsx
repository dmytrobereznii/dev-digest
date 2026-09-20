import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "@/../messages/en/skills.json";

const mutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isError: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useSkillAgents: () => ({ data: [] }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Apply when reviewing any pull request.",
  type: "rubric",
  source: "manual",
  body: "# Rubric\nKeep findings high signal.",
  enabled: true,
  version: 4,
};

function renderEditor(tab = "config") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillEditor skill={SKILL} tab={tab} onTab={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor", () => {
  it("ships only the Config and Versions tabs (D7)", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Versions" })).toBeInTheDocument();
    // Preview / Evals / Stats are deferred — absent, not disabled.
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
  });

  it("shows the next-version save hint only once the body is dirty", () => {
    renderEditor();
    // A metadata-only edit does not version the skill, so no hint yet.
    expect(screen.queryByText(/Saving snapshots the body/)).not.toBeInTheDocument();

    const body = screen.getByRole("textbox", { name: "pr-quality-rubric.md" });
    fireEvent.change(body, { target: { value: "# Rubric\nCap at five findings." } });

    // v4 + 1 — the same rule the server applies when it snapshots the body.
    expect(screen.getByText("Saving snapshots the body as v5")).toBeInTheDocument();
  });
});
