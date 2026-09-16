import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: undefined, isPending: true, isError: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "p1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "sha",
    additions: 200,
    deletions: 40,
    files_count: 9,
    status: "needs_review",
    updated_at: null,
    score: null,
    cost_usd: null,
    findings: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — Findings column", () => {
  it("shows the latest review's non-zero severity counts", () => {
    renderRow(pr({ score: 61, findings: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 } }));
    expect(within(screen.getByLabelText("2 critical")).getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("1 suggestion")).toBeInTheDocument();
    expect(screen.queryByLabelText(/warning/)).not.toBeInTheDocument();
  });

  it("shows no counts for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, findings: null }));
    expect(screen.queryByLabelText(/critical|warning|suggestion/)).not.toBeInTheDocument();
  });
});
