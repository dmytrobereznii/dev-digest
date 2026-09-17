import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

import { FindingsCell } from "./FindingsCell";

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret committed",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "A literal **key** is committed.",
    suggestion: null,
    confidence: 0.97,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

const REVIEWS = [
  {
    id: "r1",
    kind: "review",
    findings: [
      finding({ id: "f1" }),
      finding({
        id: "f2",
        severity: "WARNING",
        category: "perf",
        title: "N+1 query under load",
        file: "src/api/users.ts",
        start_line: 46,
        end_line: 49,
        confidence: 0.86,
        rationale: "A per-row query inside a loop.",
      }),
    ],
  },
] as ReviewRecord[];

const COUNTS = { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 };

function renderCell(counts = COUNTS, onRowClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <div onClick={onRowClick}>
        <FindingsCell prId="p1" counts={counts} />
      </div>
    </NextIntlClientProvider>,
  );
  return onRowClick;
}

beforeEach(() => {
  usePrReviews.mockReset();
  usePrReviews.mockReturnValue({ data: REVIEWS, isPending: false, isError: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const trigger = () => screen.getByLabelText("2 FINDINGS IN THIS RUN", { selector: "span" });

describe("FindingsCell", () => {
  it("renders a dash and no popover trigger for an unreviewed PR", () => {
    renderCell(null as never);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByLabelText(/IN THIS RUN/)).not.toBeInTheDocument();
  });

  it("loads the run's findings only once the counts are hovered", () => {
    renderCell();
    expect(usePrReviews).toHaveBeenLastCalledWith(null);
    fireEvent.mouseEnter(trigger());
    expect(usePrReviews).toHaveBeenLastCalledWith("p1");
  });

  it("shows a popover headed 'N FINDINGS IN THIS RUN' with a text preview per finding", () => {
    renderCell();
    fireEvent.mouseEnter(trigger());
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(within(pop).getByText("Hardcoded secret committed")).toBeInTheDocument();
    expect(within(pop).getByText("security")).toBeInTheDocument();
    expect(within(pop).getByText("src/config.ts:12")).toBeInTheDocument();
    expect(within(pop).getByText("97% conf")).toBeInTheDocument();
    expect(within(pop).getByText("A literal key is committed.")).toBeInTheDocument();
    expect(within(pop).getByText("src/api/users.ts:46-49")).toBeInTheDocument();
  });

  it("is read-only: no buttons, and a click inside does not reach the row", () => {
    const onRowClick = renderCell();
    fireEvent.mouseEnter(trigger());
    const pop = screen.getByRole("tooltip");
    expect(within(pop).queryAllByRole("button")).toHaveLength(0);
    fireEvent.click(within(pop).getByText("Hardcoded secret committed"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows a loading line while the findings are fetched", () => {
    usePrReviews.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderCell();
    fireEvent.mouseEnter(trigger());
    expect(within(screen.getByRole("tooltip")).getByText("Loading findings…")).toBeInTheDocument();
  });

  it("closes after the pointer leaves, unless it moves into the popover", () => {
    vi.useFakeTimers();
    renderCell();
    fireEvent.mouseEnter(trigger());
    fireEvent.mouseLeave(trigger());
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
