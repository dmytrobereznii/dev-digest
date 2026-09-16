import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "f1" }),
  finding({
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "Unbounded retry loop",
    file: "src/retry.ts",
  }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The chip is a button labelled "<Severity> <count>". */
function chip(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity filter", () => {
  it("counts each severity, including one with no findings", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(within(chip("Critical")).getByText("1")).toBeInTheDocument();
    expect(within(chip("Warning")).getByText("1")).toBeInTheDocument();
    expect(within(chip("Suggestion")).getByText("0")).toBeInTheDocument();
  });

  it("hides a severity's findings when its chip is clicked", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("Unbounded retry loop")).toBeInTheDocument();
    // The count is over the run's full set, so it doesn't move.
    expect(within(chip("Critical")).getByText("1")).toBeInTheDocument();
  });

  it("restores the findings when the chip is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Critical"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unbounded retry loop")).toBeInTheDocument();
  });

  it("shows the empty state when every severity is filtered out", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Warning"));
    fireEvent.click(chip("Suggestion"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
