/** OverviewTab — spec 12 (PR why and risk brief). The three data hooks are
    mocked (repo idiom — no fetch, no MSW); the child cards render for real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import { brief as briefMessages, prReview } from "@/test/messages";
import blast from "@/../messages/en/blast.json";

let briefData: PrBriefResponse;

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: briefData, isLoading: false, isError: false, refetch: vi.fn() }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: { intent: null }, isLoading: false }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  briefData = { brief: null, generating: false };
});
briefData = { brief: null, generating: false };

const STORED: PrBriefRecord = {
  summary: "Stored brief summary text.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      {
        kind: "security",
        title: "Token compared with ==",
        explanation: "x",
        severity: "high",
        file_refs: ["src/auth/token.ts"],
      },
    ],
  },
  review_focus: [{ file: "src/auth/token.ts", line: 7, reason: "Start here" }],
  history: { history: [] },
  pr_id: "11111111-1111-4111-8111-111111111111",
  head_sha: "abc123",
  generated_at: "2026-10-03T10:00:00.000Z",
  model: "anthropic/claude-haiku-4.5",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.01,
  missing_inputs: [],
  specs_used: [],
  dropped: { risks: 0, review_focus: 0 },
  stale: false,
};

const REVIEW = {
  id: "r1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "General Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Review summary: hardcoded secret.",
  score: 42,
  model: null,
  cost_usd: 0.01,
  grounding: null,
  created_at: "2026-09-20T00:00:00.000Z",
  findings: [],
} as ReviewRecord;

function renderTab(reviews: ReviewRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview, blast }}>
      <OverviewTab prId="pr1" reviews={reviews} runs={[]} repoFullName="o/r" headSha="abc" />
    </NextIntlClientProvider>,
  );
}

/** `a` comes before `b` in document order. */
function before(a: HTMLElement, b: HTMLElement) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("OverviewTab", () => {
  it("no brief: Intent and Blast radius render, Risk areas and Review focus do not", () => {
    renderTab();
    expect(screen.getByText(briefMessages.block.intent)).toBeInTheDocument();
    expect(screen.getByText(briefMessages.block.blast)).toBeInTheDocument();
    expect(screen.queryByText(briefMessages.block.risks)).not.toBeInTheDocument();
    expect(screen.queryByText(briefMessages.focus.title)).not.toBeInTheDocument();
  });

  it("with a brief: summary between the banner and the grid, Risk areas below Intent, Review focus below the grid", () => {
    briefData = { brief: STORED, generating: false };
    renderTab([REVIEW]);
    const banner = screen.getByText(prReview.verdict.requestChanges);
    const summary = screen.getByText("Stored brief summary text.");
    const intent = screen.getByText(briefMessages.block.intent);
    const risks = screen.getByText(briefMessages.block.risks);
    const blast = screen.getByText(briefMessages.block.blast);
    const focus = screen.getByText(briefMessages.focus.title);

    expect(before(banner, summary)).toBe(true);
    expect(before(summary, intent)).toBe(true);
    expect(before(intent, risks)).toBe(true);
    expect(before(risks, blast)).toBe(true);
    expect(before(blast, focus)).toBe(true);
    expect(screen.getByText(/Token compared with ==/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/auth/token.ts:7" })).toBeInTheDocument();
  });

  it.each([
    ["without a brief", { brief: null, generating: false }],
    ["with a brief", { brief: STORED, generating: false }],
  ] as [string, PrBriefResponse][])(
    "with a review the banner shows the review's summary, %s",
    (_label, data) => {
      briefData = data;
      renderTab([REVIEW]);
      expect(screen.getByText("Review summary: hardcoded secret.")).toBeInTheDocument();
      expect(screen.queryByText(prReview.overview.noReview)).not.toBeInTheDocument();
    },
  );

  it.each([
    ["without a brief", { brief: null, generating: false }],
    ["with a brief", { brief: STORED, generating: false }],
  ] as [string, PrBriefResponse][])(
    "without a review the Not reviewed yet note shows, %s",
    (_label, data) => {
      briefData = data;
      renderTab([]);
      expect(screen.getByText(prReview.overview.noReview)).toBeInTheDocument();
      expect(screen.queryByText("Review summary: hardcoded secret.")).not.toBeInTheDocument();
    },
  );
});
