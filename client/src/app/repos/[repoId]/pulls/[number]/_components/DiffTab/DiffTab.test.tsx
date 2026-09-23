/**
 * DiffTab — the Smart Diff view (spec 08 §7 step 6, T7). `DiffTab.tsx` still
 * renders a single flat `DiffViewer` with hardcoded English and no grouping,
 * so every case here is expected to fail until the implementer wires
 * `useSmartDiff` + `getViewGroups`/`getMarker` and the RoleGroup/OrderToggle
 * components (A7-A15). `@/lib/hooks/reviews` is mocked (repo idiom — no
 * fetch, no MSW); the fixture mirrors #499's shape (spec §6) but keeps
 * patches minimal for readability.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { prReview, shell } from "@/test/messages";

let smartDiffData: SmartDiffResponse | undefined;
let reviewsData: ReviewRecord[] | undefined;
const dismiss = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  useSmartDiff: () => ({ data: smartDiffData, isLoading: false, isError: false }),
  usePrReviews: () => ({ data: reviewsData, isLoading: false }),
  useFindingAction: () => ({ mutate: dismiss, isPending: false }),
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  dismiss.mockClear();
  smartDiffData = undefined;
  reviewsData = undefined;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// ---- #499-like fixture (spec §6): one file per role, findings in three ----
const RETRY_WINDOW_PATCH = [
  "@@ -0,0 +1,3 @@",
  "+export class RetryWindow {",
  "+  record(now: number = Date.now()): void {",
  "+    this.attempts.push(now);",
].join("\n");

const RETRY_ROUTE_PATCH = [
  "@@ -1,2 +1,3 @@",
  " const router = Router();",
  "+if (!retryWindow.canAttempt()) {",
  "+  return res.status(429).json({ error: 'retry_window_exhausted' });",
].join("\n");

const RETRY_TEST_PATCH = [
  "@@ -0,0 +1,2 @@",
  "+import { RetryWindow } from '../../src/lib/retry-window';",
  "+describe('RetryWindow', () => {});",
].join("\n");

const INDEX_PATCH = ["@@ -1,1 +1,2 @@", " export * from './redis';", "+export * from './retry-window';"].join(
  "\n",
);
const PKG_PATCH = ["@@ -1,1 +1,2 @@", ' "scripts": {', '+  "test:retry": "vitest run",'].join("\n");
const DOC_PATCH = ["@@ -0,0 +1,2 @@", "+# Payout retry window", "+Caps retries."].join("\n");
// Distinctive text used to prove the collapsed boilerplate group isn't rendered.
const LOCK_PATCH = ["@@ -40,1 +40,1 @@", "-  ioredis: 5.3.2", "+  ioredis: 5.4.1"].join("\n");

const FILES: PrFile[] = [
  { path: "src/lib/retry-window.ts", additions: 10, deletions: 0, patch: RETRY_WINDOW_PATCH },
  { path: "src/api/payouts/retry.ts", additions: 5, deletions: 3, patch: RETRY_ROUTE_PATCH },
  { path: "test/lib/retry-window.test.ts", additions: 8, deletions: 0, patch: RETRY_TEST_PATCH },
  { path: "src/lib/index.ts", additions: 1, deletions: 0, patch: INDEX_PATCH },
  { path: "package.json", additions: 1, deletions: 0, patch: PKG_PATCH },
  { path: "docs/retry-window.md", additions: 6, deletions: 0, patch: DOC_PATCH },
  { path: "pnpm-lock.yaml", additions: 4, deletions: 4, patch: LOCK_PATCH },
];

function smartDiffFixture(o: { reviewId?: string | null; zeroFindings?: boolean } = {}): SmartDiffResponse {
  const fl = (lines: number[]) => (o.zeroFindings ? [] : lines);
  return {
    review_id: o.reviewId === undefined ? "rev-499" : o.reviewId,
    groups: [
      {
        role: "core",
        files: [
          { path: "src/lib/retry-window.ts", additions: 10, deletions: 0, finding_lines: fl([2]) },
          { path: "src/api/payouts/retry.ts", additions: 5, deletions: 3, finding_lines: fl([3]) },
        ],
      },
      {
        role: "tests",
        files: [{ path: "test/lib/retry-window.test.ts", additions: 8, deletions: 0, finding_lines: fl([2]) }],
      },
      {
        role: "wiring",
        files: [
          { path: "src/lib/index.ts", additions: 1, deletions: 0, finding_lines: [] },
          { path: "package.json", additions: 1, deletions: 0, finding_lines: [] },
        ],
      },
      { role: "docs", files: [{ path: "docs/retry-window.md", additions: 6, deletions: 0, finding_lines: [] }] },
      {
        role: "boilerplate",
        files: [{ path: "pnpm-lock.yaml", additions: 4, deletions: 4, finding_lines: [] }],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 42, proposed_splits: [] },
  };
}

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "file" | "start_line">): FindingRecord {
  return {
    end_line: o.start_line,
    category: "bug",
    title: "finding",
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: null,
    trifecta_components: null,
    evidence: null,
    review_id: "rev-499",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

const REVIEW: ReviewRecord = {
  id: "rev-499",
  pr_id: "pr-499",
  agent_id: "agent-1",
  run_id: "run-1",
  agent_name: "General Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Good fix, two gaps.",
  score: 42,
  model: "anthropic/claude-haiku-4.5",
  cost_usd: 0.017,
  grounding: "3/3 passed",
  created_at: "2026-09-22T00:00:00.000Z",
  findings: [
    finding({
      id: "f-critical",
      severity: "CRITICAL",
      file: "src/lib/retry-window.ts",
      start_line: 2,
      title: "Unbounded retry-attempt queue growth in RetryWindow",
    }),
    finding({
      id: "f-warning",
      severity: "WARNING",
      file: "src/api/payouts/retry.ts",
      start_line: 3,
      title: "No Retry-After header on the 429 response",
    }),
    finding({
      id: "f-suggestion",
      severity: "SUGGESTION",
      file: "test/lib/retry-window.test.ts",
      start_line: 2,
      title: "No test exercises the window filling up",
    }),
  ],
};

// ---- Fix 1 fixture: one file, three rendered add lines (y, z, w) plus a
// range (50-51) with no rendered line at all. `f-range` spans two rendered
// lines (y, z) — the design (diff.jsx CodeLine + the user's screenshot) marks
// every line of start_line..end_line, not just start_line, and the card sits
// once, after the LAST rendered line (GitHub-style), not wedged after
// start_line. `f-dismissed` sits on a third rendered line to prove dismissal
// still suppresses the marker even though the line itself renders.
// `f-outside`'s whole range is unrendered, so it still goes to "Outside the
// diff" (unchanged, D7/A13) exactly once — not once per line of its range.
const MULTI_LINE_PATCH = [
  "@@ -1,1 +1,4 @@",
  " const x = 1;",
  "+const y = 2;",
  "+const z = 3;",
  "+const w = 4;",
].join("\n");

const MULTI_LINE_FILES: PrFile[] = [
  { path: "src/multi.ts", additions: 3, deletions: 0, patch: MULTI_LINE_PATCH },
];

function multiLineSmartDiff(): SmartDiffResponse {
  return {
    review_id: "rev-multi",
    groups: [
      { role: "core", files: [{ path: "src/multi.ts", additions: 3, deletions: 0, finding_lines: [2, 3] }] },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [] },
    ],
    split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
  };
}

const MULTI_LINE_REVIEW: ReviewRecord = {
  id: "rev-multi",
  pr_id: "pr-multi",
  agent_id: "agent-1",
  run_id: "run-1",
  agent_name: "General Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "One range finding, one dismissed, one outside the diff.",
  score: 50,
  model: "anthropic/claude-haiku-4.5",
  cost_usd: 0.01,
  grounding: "3/3 passed",
  created_at: "2026-09-22T00:00:00.000Z",
  findings: [
    finding({
      id: "f-range",
      severity: "WARNING",
      file: "src/multi.ts",
      start_line: 2,
      end_line: 3,
      title: "Multi-line issue across y and z",
    }),
    finding({
      id: "f-dismissed",
      severity: "CRITICAL",
      file: "src/multi.ts",
      start_line: 4,
      end_line: 4,
      title: "Dismissed finding on w",
      dismissed_at: "2026-09-20T00:00:00Z",
    }),
    finding({
      id: "f-outside",
      severity: "SUGGESTION",
      file: "src/multi.ts",
      start_line: 50,
      end_line: 51,
      title: "Range entirely off the rendered diff",
    }),
  ],
};

describe("DiffTab — multi-line findings mark every rendered line (Fix 1)", () => {
  it("puts a marker bar on every rendered line of a finding's start_line..end_line range, and skips a dismissed finding's own rendered line", () => {
    smartDiffData = multiLineSmartDiff();
    reviewsData = [MULTI_LINE_REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-multi" filesCount={1} files={MULTI_LINE_FILES} canComment />,
    );

    // f-range (2-3) should mark both its rendered lines; f-dismissed's own
    // rendered line (4) and f-outside's unrendered range (50-51) add none.
    expect(screen.getAllByTestId("line-marker-bar")).toHaveLength(2);
    // The dismissed finding's card still renders (muted by FindingCard itself).
    expect(container.textContent ?? "").toContain("Dismissed finding on w");
  });

  it("renders the finding card once, after the LAST rendered line of its range, instead of splitting the range after start_line", () => {
    smartDiffData = multiLineSmartDiff();
    reviewsData = [MULTI_LINE_REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-multi" filesCount={1} files={MULTI_LINE_FILES} canComment />,
    );
    const text = container.textContent ?? "";

    const iY = text.indexOf("const y = 2;");
    const iZ = text.indexOf("const z = 3;");
    const iCard = text.indexOf("Multi-line issue across y and z");
    expect(iY).toBeGreaterThanOrEqual(0);
    expect(iZ).toBeGreaterThan(iY);
    // GitHub-style: the card sits after BOTH lines of the range, not between them.
    expect(iCard).toBeGreaterThan(iZ);
    // Exactly one card for this finding, not one per rendered line of its range.
    expect(screen.getAllByText("Multi-line issue across y and z")).toHaveLength(1);
  });

  it("sends a finding whose whole range is off the rendered diff to 'Outside the diff' exactly once (unchanged)", () => {
    smartDiffData = multiLineSmartDiff();
    reviewsData = [MULTI_LINE_REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-multi" filesCount={1} files={MULTI_LINE_FILES} canComment />,
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Outside the diff");
    expect(screen.getAllByText("Range entirely off the rendered diff")).toHaveLength(1);
    expect(text.indexOf("Outside the diff")).toBeLessThan(text.indexOf("Range entirely off the rendered diff"));
  });
});

/** The slice of the page between two role labels (or to the end), so a
    per-group assertion can't accidentally read a neighbouring group. */
function sectionText(full: string, start: string, end: string | null): string {
  const s = full.indexOf(start);
  const e = end ? full.indexOf(end) : full.length;
  return full.slice(s, e === -1 ? full.length : e);
}

describe("DiffTab — Smart Diff grouping (A7-A9)", () => {
  it("renders headers core→tests→wiring→docs→boilerplate, each with '● N' (files with findings) before 'N files'", () => {
    smartDiffData = smartDiffFixture();
    reviewsData = [REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />,
    );
    const text = container.textContent ?? "";

    const idx = {
      core: text.indexOf("Core logic"),
      tests: text.indexOf("Tests"),
      wiring: text.indexOf("Wiring"),
      docs: text.indexOf("Docs"),
      boilerplate: text.indexOf("Boilerplate"),
    };
    expect(Object.values(idx).every((i) => i >= 0)).toBe(true);
    expect(idx.core).toBeLessThan(idx.tests);
    expect(idx.tests).toBeLessThan(idx.wiring);
    expect(idx.wiring).toBeLessThan(idx.docs);
    expect(idx.docs).toBeLessThan(idx.boilerplate);

    // Core: 2/2 files flagged. Tests: 1/1. Wiring/docs/boilerplate: none flagged, so no dot.
    expect(sectionText(text, "Core logic", "Tests")).toContain("● 2");
    expect(sectionText(text, "Core logic", "Tests")).toContain("2 files");
    expect(sectionText(text, "Tests", "Wiring")).toContain("● 1");
    expect(sectionText(text, "Tests", "Wiring")).toContain("1 file");
    expect(sectionText(text, "Tests", "Wiring")).not.toContain("1 files");
    expect(sectionText(text, "Wiring", "Docs")).not.toMatch(/●/);
    expect(sectionText(text, "Wiring", "Docs")).toContain("2 files");
    expect(sectionText(text, "Docs", "Boilerplate")).not.toMatch(/●/);
    expect(sectionText(text, "Boilerplate", null)).not.toMatch(/●/);
  });
});

describe("DiffTab — empty groups hidden (A7)", () => {
  it("shows only the roles that have files (tests/docs/boilerplate absent on a 2-file PR)", () => {
    const files: PrFile[] = [
      { path: "src/config.ts", additions: 3, deletions: 0, patch: null },
      { path: "src/api/users.ts", additions: 4, deletions: 1, patch: null },
    ];
    smartDiffData = {
      review_id: null,
      groups: [
        { role: "core", files: [{ path: "src/api/users.ts", additions: 4, deletions: 1, finding_lines: [] }] },
        { role: "tests", files: [] },
        { role: "wiring", files: [{ path: "src/config.ts", additions: 3, deletions: 0, finding_lines: [] }] },
        { role: "docs", files: [] },
        { role: "boilerplate", files: [] },
      ],
      split_suggestion: { too_big: false, total_lines: 8, proposed_splits: [] },
    };
    reviewsData = [];

    renderWithIntl(<DiffTab prId="pr-482" filesCount={2} files={files} canComment />);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
  });
});

describe("DiffTab — collapse defaults (D6/A8)", () => {
  it("keeps Boilerplate collapsed on load, so the lock file's content is absent until it's expanded", () => {
    smartDiffData = smartDiffFixture();
    reviewsData = [REVIEW];
    renderWithIntl(<DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />);

    expect(screen.queryByText(/ioredis: 5\.4\.1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Boilerplate"));

    expect(screen.getByText(/ioredis: 5\.4\.1/)).toBeInTheDocument();
  });
});

describe("DiffTab — inline finding card (A11)", () => {
  it("renders the FindingCard for the flagged line, under its own file's code", () => {
    smartDiffData = smartDiffFixture();
    reviewsData = [REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />,
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Unbounded retry-attempt queue growth in RetryWindow");
    // The card sits under the flagged line's own code, not above it or in an unrelated file.
    expect(text.indexOf("record(now")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("record(now")).toBeLessThan(
      text.indexOf("Unbounded retry-attempt queue growth in RetryWindow"),
    );
  });

  it("Reject on the inline card dismisses exactly that finding", () => {
    smartDiffData = smartDiffFixture();
    reviewsData = [REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />,
    );
    const card = container.querySelector('[data-finding-id="f-critical"]');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Reject" }));

    expect(dismiss).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: "f-critical", action: "dismiss", prId: "pr-499" }),
    );
  });
});

describe("DiffTab — Original order (A14, Fix 2)", () => {
  // FILES is deliberately NOT in path order (retry-window.ts before retry.ts,
  // pnpm-lock.yaml last) — Original order must not just echo pr.files; the
  // design (diff.jsx SmartDiff) sorts it by path, same as git's own diff order.
  const EXPECTED_PATH_ORDER = [
    "docs/retry-window.md",
    "package.json",
    "pnpm-lock.yaml",
    "src/api/payouts/retry.ts",
    "src/lib/index.ts",
    "src/lib/retry-window.ts",
    "test/lib/retry-window.test.ts",
  ];

  it("renders one flat list sorted by path, not in pr.files order, with no group headers", () => {
    smartDiffData = smartDiffFixture();
    reviewsData = [REVIEW];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    const text = container.textContent ?? "";
    const order = EXPECTED_PATH_ORDER.map((p) => text.indexOf(p));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // pr.files's own order (retry-window.ts, then retry.ts) must NOT survive:
    // path order puts retry.ts (api/) before retry-window.ts (lib/).
    expect(text.indexOf("src/api/payouts/retry.ts")).toBeLessThan(text.indexOf("src/lib/retry-window.ts"));
  });
});

describe("DiffTab — no review yet (A15)", () => {
  it("shows the no-review hint and no finding dots when there is no review", () => {
    smartDiffData = smartDiffFixture({ reviewId: null, zeroFindings: true });
    reviewsData = [];
    const { container } = renderWithIntl(
      <DiffTab prId="pr-499" filesCount={7} files={FILES} canComment />,
    );

    expect(screen.getByText("No review yet — run one to see findings inline")).toBeInTheDocument();
    expect((container.textContent ?? "")).not.toMatch(/●/);
  });
});
