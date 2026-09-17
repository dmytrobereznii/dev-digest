import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

/** The pill is a button labelled "<count> <SEVERITY>". */
function pill(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^\\d+ ${label}$`) });
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
  it("draws a pill per severity present, labelled with its count", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(pill("CRITICAL")).toHaveTextContent("1 CRITICAL");
    expect(pill("WARNING")).toHaveTextContent("1 WARNING");
    expect(screen.queryByRole("button", { name: /SUGGESTION$/ })).not.toBeInTheDocument();
  });

  it("draws no pills for a run with no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /CRITICAL$/ })).not.toBeInTheDocument();
  });

  it("counts every finding of a severity, matching the cards below", () => {
    const three = [...FINDINGS, finding({ id: "f3", title: "SQL injection" })];
    renderWithIntl(<FindingsPanel findings={three} prId="pr1" />);
    expect(pill("CRITICAL")).toHaveTextContent("2 CRITICAL");
    fireEvent.click(pill("CRITICAL"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
  });

  it("shows only that severity's findings when its pill is clicked", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(pill("WARNING"));
    expect(screen.getByText("Unbounded retry loop")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    // The count is over the run's full set, so the other pill keeps its number.
    expect(pill("CRITICAL")).toHaveTextContent("1 CRITICAL");
  });

  it("clears the filter when the same pill is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(pill("CRITICAL"));
    fireEvent.click(pill("CRITICAL"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unbounded retry loop")).toBeInTheDocument();
  });

  it("switches to another severity when a different pill is clicked", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(pill("CRITICAL"));
    fireEvent.click(pill("WARNING"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("Unbounded retry loop")).toBeInTheDocument();
  });
});
