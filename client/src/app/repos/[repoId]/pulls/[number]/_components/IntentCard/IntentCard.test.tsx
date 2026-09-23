import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/brief.json";
import type { PrIntentRecord } from "@devdigest/shared";

const derive = vi.fn();
let queryData: { intent: PrIntentRecord | null } | undefined;
let queryLoading = false;

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: queryData, isLoading: queryLoading }),
  useDeriveIntent: () => ({ mutate: derive, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  derive.mockClear();
  queryData = undefined;
  queryLoading = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const RECORD: PrIntentRecord = {
  intent: "Add rate limiting to public API endpoints.",
  in_scope: ["Add middleware for rate limiting", "Apply to /api/public/* routes"],
  out_of_scope: ["Authentication changes"],
  pr_id: "pr1",
  confidence: "high",
  signals: ["title", "description"],
  sources: [
    { kind: "issue", ref: "#12", status: "used", reason: null, title: "spec", chars: 400, truncated: false },
    {
      kind: "external",
      ref: "https://example.com/spec",
      status: "skipped",
      reason: "external_not_fetched",
      title: null,
      chars: null,
      truncated: false,
    },
  ],
  model: "anthropic/claude-haiku-4.5",
  cost_usd: 0.0012,
  tokens_in: 1200,
  tokens_out: 300,
  head_sha: "abc123",
  derived_at: "2026-09-20T00:00:00.000Z",
  stale: false,
};

describe("IntentCard", () => {
  it("renders the quote, both scope lists, the confidence badge and sources", () => {
    queryData = { intent: RECORD };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText(/Add rate limiting to public API endpoints\./)).toBeInTheDocument();
    expect(screen.getByText("Add middleware for rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
    expect(screen.getByText("High confidence · documented")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("(not fetched)")).toBeInTheDocument();
  });

  it("omits the Sources label when nothing was referenced", () => {
    queryData = { intent: { ...RECORD, sources: [] } };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.getByText("Re-derive")).toBeInTheDocument();
  });

  it("shows the low-confidence signals hint", () => {
    queryData = { intent: { ...RECORD, confidence: "low", signals: ["title", "branch", "file_paths"] } };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("Low confidence · inferred")).toBeInTheDocument();
    expect(screen.getByText("Inferred from: title, branch, file paths")).toBeInTheDocument();
  });

  it("shows a stale note when the row is stale", () => {
    queryData = { intent: { ...RECORD, stale: true } };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("Stale — the PR has changed since this was derived")).toBeInTheDocument();
  });

  it("shows 'Nothing stated' for an empty out-of-scope list", () => {
    queryData = { intent: { ...RECORD, out_of_scope: [] } };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("Nothing stated")).toBeInTheDocument();
  });

  it("renders the empty state and derives on click", async () => {
    queryData = { intent: null };
    renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("No intent yet")).toBeInTheDocument();
    const cta = screen.getByText("Derive intent");
    cta.click();
    expect(derive).toHaveBeenCalledWith({ force: false });
  });
});
