/**
 * SeverityCounts is the shared summary on the PR list and the run timeline, so
 * its order, zero-skipping and empty fallback are pinned here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityCounts } from "./SeverityCounts";

afterEach(cleanup);

describe("SeverityCounts", () => {
  it("renders one labelled count per non-zero severity, most severe first", () => {
    render(<SeverityCounts counts={{ SUGGESTION: 3, CRITICAL: 2, WARNING: 0 }} />);
    const counts = screen.getAllByRole("img");
    expect(counts.map((c) => c.getAttribute("aria-label"))).toEqual(["2 critical", "3 suggestion"]);
    expect(counts[0]).toHaveTextContent("2");
  });

  it("renders the empty fallback when every severity is zero", () => {
    render(<SeverityCounts counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} empty="—" />);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the empty fallback when counts are missing", () => {
    render(<SeverityCounts counts={null} empty="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders nothing by default when empty", () => {
    const { container } = render(<SeverityCounts counts={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
