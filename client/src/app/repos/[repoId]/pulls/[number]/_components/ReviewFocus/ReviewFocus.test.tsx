import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import { brief as messages } from "@/test/messages";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const ITEMS: ReviewFocusItem[] = [
  { file: "src/b.ts", line: 12, reason: "Second file, first in order" },
  { file: "src/a.ts", line: 3, reason: "First file, second in order" },
  { file: "src/c.ts", line: 99, reason: "Third" },
];

function renderFocus(items: ReviewFocusItem[], onOpen?: (f: string, l: number) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus items={items} onOpen={onOpen} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocus", () => {
  it("one row per entry as file:line — reason, in stored order", () => {
    renderFocus(ITEMS);
    expect(screen.getByText(messages.focus.title)).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("src/b.ts:12");
    expect(rows[0]).toHaveTextContent("Second file, first in order");
    expect(rows[1]).toHaveTextContent("src/a.ts:3");
    expect(rows[2]).toHaveTextContent("src/c.ts:99");
    expect(rows[0]!.textContent).toMatch(/src\/b\.ts:12\s*—\s*Second file, first in order/);
  });

  it("shows the number of entries beside the label", () => {
    renderFocus(ITEMS);
    const label = screen.getByText(messages.focus.title);
    expect(within(label.parentElement!).getByText("3")).toBeInTheDocument();
  });

  it("the count is a badge directly after the label", () => {
    renderFocus(ITEMS);
    const label = screen.getByText(messages.focus.title);
    // The label text node is followed immediately by the count, nothing between.
    const count = screen.getByText("3");
    expect(label.contains(count)).toBe(true);
    expect(count.closest("li")).toBeNull();
    const text = label.textContent ?? "";
    expect(text.startsWith(messages.focus.title)).toBe(true);
    expect(text).toBe(`${messages.focus.title}3`);
    // The label's own children: text node then the badge wrapper, in that order.
    const last = label.lastElementChild as HTMLElement;
    expect(last).toContainElement(count);
    expect(label.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it("each row starts with a decorative bullet", () => {
    renderFocus(ITEMS);
    for (const row of screen.getAllByRole("listitem")) {
      const first = row.firstElementChild as HTMLElement;
      expect(first.tagName).toBe("SPAN");
      expect(first).toHaveAttribute("aria-hidden", "true");
      expect(first).toBeEmptyDOMElement();
      expect(first.nextElementSibling?.tagName).toBe("BUTTON");
    }
    const row = screen.getAllByRole("listitem")[0]!;
    expect(within(row).getByRole("button", { name: "src/b.ts:12" })).toBeInTheDocument();
    expect(within(row).getByText("Second file, first in order")).toBeInTheDocument();
  });

  it("zero entries shows the no-starting-point line", () => {
    renderFocus([]);
    expect(screen.getByText(messages.focus.empty)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("activating an entry reports its file and line", () => {
    const onOpen = vi.fn();
    renderFocus(ITEMS, onOpen);
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:3" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("src/a.ts", 3);
  });

  it("each entry is a button and its path carries its full text as title", () => {
    renderFocus(ITEMS);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(buttons[0]).toHaveAttribute("title", "src/b.ts:12");
  });

  it("markup in a reason or path renders as text, not as elements", () => {
    const reason = '<img src="x" onerror="alert(1)"><b>bold</b>';
    const file = "<i>x</i>.ts";
    const { container } = renderFocus([{ file, line: 1, reason }]);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent(`${file}:1`);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("i")).toBeNull();
  });
});
