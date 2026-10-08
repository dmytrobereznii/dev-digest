/** SettingsModels — spec 12 AC-83: Risk Brief falls back to its registry default. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import settings from "@/../messages/en/settings.json";

let featureModels: Record<string, { provider: string; model: string }>;

vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: { feature_models: featureModels } }),
  useUpdateSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [] }),
}));

import { SettingsModels } from "./SettingsModels";

afterEach(() => {
  cleanup();
  featureModels = {};
});
featureModels = {};

function renderModels() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

/** The FormField root of the row whose label reads "Risk Brief". */
function riskBriefRow() {
  const label = screen.getByText(/^Risk Brief/);
  return label.parentElement!.parentElement as HTMLElement;
}

describe("SettingsModels", () => {
  it("shows anthropic/claude-haiku-4.5 for Risk Brief when the workspace has chosen none", () => {
    renderModels();
    const row = riskBriefRow();
    expect(within(row).getByText("anthropic/claude-haiku-4.5")).toBeInTheDocument();
    expect(within(row).getByText(settings.models.usingDefault)).toBeInTheDocument();
  });

  it("shows the workspace's own choice for Risk Brief when one is stored", () => {
    featureModels = { risk_brief: { provider: "openrouter", model: "openai/gpt-5-mini" } };
    renderModels();
    const row = riskBriefRow();
    expect(within(row).getByText("openai/gpt-5-mini")).toBeInTheDocument();
    expect(within(row).queryByText("anthropic/claude-haiku-4.5")).not.toBeInTheDocument();
    expect(within(row).queryByText(settings.models.usingDefault)).not.toBeInTheDocument();
  });
});
