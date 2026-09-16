/**
 * formatUsd is the single money rule for every cost surface (PR list, run
 * timeline, review accordion, trace drawer), so its edges are pinned here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostBadge, formatUsd } from "./CostBadge";

afterEach(cleanup);

describe("formatUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [0, "$0.000"],
    [0.0004, "$0.0004"],
    [0.0013, "$0.001"],
    [0.014, "$0.014"],
    [0.9, "$0.900"],
    [1, "$1.00"],
    [12.345, "$12.35"],
  ])("formats %s as %s", (usd, expected) => {
    expect(formatUsd(usd as number | null | undefined)).toBe(expected);
  });

  it("keeps a sub-milli-dollar run visibly non-zero", () => {
    // 3 decimals would render "$0.000" and read as free.
    expect(formatUsd(0.00012)).not.toBe("$0.000");
  });
});

describe("CostBadge", () => {
  it("renders an em-dash when nothing has been spent yet", () => {
    render(<CostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the amount with the explanatory title", () => {
    render(<CostBadge usd={0.014} />);
    expect(screen.getByTitle("Cost of this review")).toHaveTextContent("$0.014");
  });

  it("appends the optional token detail", () => {
    render(<CostBadge usd={1.5} tokens="14.8k→1.2k" />);
    expect(screen.getByTitle("Cost of this review")).toHaveTextContent("$1.5014.8k→1.2k");
  });
});
