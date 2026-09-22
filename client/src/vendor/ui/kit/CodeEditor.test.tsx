/**
 * `estimateTokens` is the ONE token-estimate rule shared by the skill editor's
 * header and the run trace's per-block count, so its arithmetic is pinned here
 * — a drift between the two surfaces would show up as a silent disagreement,
 * not a failure.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CodeEditor, estimateTokens } from "./CodeEditor";

afterEach(cleanup);

describe("estimateTokens", () => {
  it.each([
    ["", 0],
    ["abcd", 1],
    ["ab", 1], // 0.5 rounds up
    ["a".repeat(4210 * 4), 4210],
  ])("estimates %o as %i tokens", (text, expected) => {
    expect(estimateTokens(text as string)).toBe(expected);
  });
});

describe("CodeEditor", () => {
  it("reports the token count for the current value", () => {
    render(<CodeEditor value={"a".repeat(5000)} filename="pr-quality-rubric.md" onChange={() => {}} />);
    expect(screen.getByText(`${(1250).toLocaleString()} tokens`)).toBeInTheDocument();
  });

  it("shows the filename and the unsaved badge only while dirty", () => {
    const { rerender } = render(
      <CodeEditor value="# Rule" filename="a.md" onChange={() => {}} />
    );
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    rerender(<CodeEditor value="# Rule" filename="a.md" dirty onChange={() => {}} />);
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("numbers every line of the body", () => {
    render(<CodeEditor value={"# Rule\n\n- one\n- two"} filename="a.md" onChange={() => {}} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("fires onChange with the edited value", () => {
    const onChange = vi.fn();
    render(<CodeEditor value="# Rule" filename="a.md" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "a.md" }), {
      target: { value: "# Rule\n\nBe specific." },
    });

    expect(onChange).toHaveBeenCalledWith("# Rule\n\nBe specific.");
  });

  it("is read-only when no onChange is supplied", () => {
    render(<CodeEditor value="# Rule" filename="a.md" />);
    expect(screen.getByRole("textbox", { name: "a.md" })).toHaveAttribute("readonly");
  });
});
