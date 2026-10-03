/** BriefSummary — spec 12 (PR why and risk brief). `@/lib/hooks/brief` is
    mocked, as `IntentCard.test.tsx` mocks `@/lib/hooks/intent`. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { brief as messages } from "@/test/messages";
import type { PrBriefRecord, PrBriefResponse } from "@devdigest/shared";

const mutate = vi.fn();
const refetch = vi.fn();
let readState: {
  data: PrBriefResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
let genState: { isPending: boolean; isError: boolean; error: Error | null };

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ ...readState, refetch }),
  useGenerateBrief: () => ({ ...genState, mutate }),
}));

import { BriefSummary } from "./BriefSummary";

function reset() {
  readState = { data: { brief: null, generating: false }, isLoading: false, isError: false };
  genState = { isPending: false, isError: false, error: null };
}
reset();

afterEach(() => {
  cleanup();
  mutate.mockClear();
  refetch.mockClear();
  reset();
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <BriefSummary prId="pr1" />
    </NextIntlClientProvider>,
  );
}

function makeBrief(over: Partial<PrBriefRecord> = {}): PrBriefRecord {
  return {
    summary: "Adds rate limiting to the public API.",
    intent: null,
    blast: null,
    risks: { risks: [] },
    review_focus: [],
    history: { history: [] },
    pr_id: "11111111-1111-4111-8111-111111111111",
    head_sha: "abc123",
    generated_at: "2026-10-03T10:00:00.000Z",
    model: "anthropic/claude-haiku-4.5",
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.014,
    missing_inputs: [],
    specs_used: [],
    dropped: { risks: 0, review_focus: 0 },
    stale: false,
    ...over,
  };
}

function withBrief(over: Partial<PrBriefRecord> = {}, generating = false) {
  readState.data = { brief: makeBrief(over), generating };
}

describe("BriefSummary", () => {
  it("no brief: shows Brief not available yet. and a Generate brief button", () => {
    renderCard();
    expect(screen.getByText(messages.unavailable)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.generate })).toBeEnabled();
  });

  it("Generate brief sends one generation request", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: messages.generate }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("pending: the control is disabled and labelled Generating…", () => {
    genState.isPending = true;
    renderCard();
    const btn = screen.getByRole("button", { name: messages.generating });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole("button", { name: messages.generate })).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("a stored brief shows its summary paragraph and sends no generation request", () => {
    withBrief();
    renderCard();
    const p = screen.getByText("Adds rate limiting to the public API.");
    expect(p.tagName).toBe("P");
    expect(screen.queryByText(messages.unavailable)).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("the Refresh brief control sits at the end of the summary block and sends one request", () => {
    withBrief();
    const { container } = renderCard();
    const refresh = screen.getByRole("button", { name: messages.refresh });
    const summary = screen.getByText("Adds rate limiting to the public API.");
    // After the summary and every meta line in document order, and the last focusable.
    expect(summary.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/anthropic\/claude-haiku-4\.5/).compareDocumentPosition(refresh) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const buttons = container.querySelectorAll("button");
    expect(buttons[buttons.length - 1]).toBe(refresh);
    fireEvent.click(refresh);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("a pending refresh keeps the brief visible", () => {
    withBrief();
    genState.isPending = true;
    renderCard();
    expect(screen.getByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.generating })).toBeDisabled();
    expect(screen.queryByRole("button", { name: messages.refresh })).not.toBeInTheDocument();
  });

  it("a failed generation shows the API message and enables the control again", () => {
    genState.isError = true;
    genState.error = new Error("Model unavailable");
    renderCard();
    expect(screen.getByText("Model unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.generate })).toBeEnabled();
  });

  it("a failed refresh keeps the previous brief", () => {
    withBrief({ summary: "Previous summary." });
    genState.isError = true;
    genState.error = new Error("Model unavailable");
    renderCard();
    expect(screen.getByText("Previous summary.")).toBeInTheDocument();
    expect(screen.getByText("Model unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.refresh })).toBeEnabled();
  });

  it("loading shows a skeleton in place of the summary", () => {
    readState = { data: undefined, isLoading: true, isError: false };
    const { container } = renderCard();
    expect(container.querySelector(".skeleton")).toBeInTheDocument();
    expect(screen.queryByText(messages.unavailable)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a failed read shows an error state with a retry control", () => {
    readState = { data: undefined, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText(messages.readError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a stale brief shows the stale note beside the refresh control", () => {
    withBrief({ stale: true });
    renderCard();
    const note = screen.getByText(messages.stale);
    const refresh = screen.getByRole("button", { name: messages.refresh });
    expect(note.parentElement).toBe(refresh.parentElement);
  });

  it("a brief that is not stale shows no stale note", () => {
    withBrief({ stale: false });
    renderCard();
    expect(screen.queryByText(messages.stale)).not.toBeInTheDocument();
  });

  it("generating true shows the generating state", () => {
    readState.data = { brief: null, generating: true };
    renderCard();
    expect(screen.getByRole("button", { name: messages.generating })).toBeDisabled();
    expect(screen.queryByText(messages.unavailable)).not.toBeInTheDocument();
  });

  it("names each missing input", () => {
    withBrief({ missing_inputs: ["intent", "blast", "specs"] });
    renderCard();
    expect(
      screen.getByText("Generated without: Intent, Blast radius, Project context documents"),
    ).toBeInTheDocument();
  });

  it("shows no missing-inputs line when nothing is missing", () => {
    withBrief({ missing_inputs: [] });
    renderCard();
    expect(screen.queryByText(/Generated without/)).not.toBeInTheDocument();
  });

  it("lists the documents used", () => {
    withBrief({ specs_used: ["docs/architecture.md", "docs/rate-limits.md"] });
    renderCard();
    expect(screen.getByText(messages.specsUsed)).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("docs/rate-limits.md")).toBeInTheDocument();
  });

  it("shows no documents label when none were used", () => {
    withBrief({ specs_used: [] });
    renderCard();
    expect(screen.queryByText(messages.specsUsed)).not.toBeInTheDocument();
  });

  it("shows the model slug and the cost", () => {
    withBrief({ model: "anthropic/claude-haiku-4.5", cost_usd: 0.014 });
    renderCard();
    expect(screen.getByText("anthropic/claude-haiku-4.5 · $0.014")).toBeInTheDocument();
  });

  it("generate and refresh are buttons and the old hint is not shown", () => {
    renderCard();
    expect(screen.getByRole("button", { name: messages.generate }).tagName).toBe("BUTTON");
    expect(screen.queryByText(messages.unavailableHint)).not.toBeInTheDocument();
    cleanup();

    withBrief();
    renderCard();
    expect(screen.getByRole("button", { name: messages.refresh }).tagName).toBe("BUTTON");
    expect(screen.queryByText(messages.unavailableHint)).not.toBeInTheDocument();
  });

  it("markup in a summary renders as text, not as elements", () => {
    const evil = '<img src="x" onerror="alert(1)"><b>bold</b>';
    withBrief({ summary: evil });
    const { container } = renderCard();
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
