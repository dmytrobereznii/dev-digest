import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";
import { CaseModal } from "./CaseModal";

afterEach(cleanup);

const DIFF = [
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-const b = query(user);",
  "+const b = query(<script>alert(1)</script>);",
].join("\n");

function makeCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "a1",
    name: "SQL injection in login",
    finding_id: "f1",
    input_diff: DIFF,
    input_meta: { pr_title: "Harden the login query", pr_description: "Switches to a prepared statement." },
    expected_output: {
      type: "must_find",
      file: "src/login.ts",
      start_line: 12,
      end_line: 14,
      title: "String-built SQL",
      severity: "CRITICAL",
      category: "security",
    },
    created_at: "2026-10-10T10:00:00Z",
    last_result: null,
    ...over,
  };
}

function result(over: Partial<NonNullable<EvalCase["last_result"]>> = {}): NonNullable<EvalCase["last_result"]> {
  return {
    case_id: "c1",
    case_name: "SQL injection in login",
    expectation_type: "must_find",
    pass: true,
    matched: 1,
    unjudged: 0,
    kept: 1,
    dropped: 0,
    findings: [],
    duration_ms: 2500,
    cost_usd: 0.0123,
    ...over,
  };
}

function renderModal(evalCase: EvalCase, onClose: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <CaseModal evalCase={evalCase} agentName="Security Reviewer" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe("CaseModal", () => {
  it("shows the name, the PR title and description, the expectation and the last result", () => {
    renderModal(makeCase({ last_result: result() }));

    expect(screen.getByText("Eval case · SQL injection in login")).toBeInTheDocument();
    expect(screen.getByText("Harden the login query")).toBeInTheDocument();
    expect(screen.getByText("Switches to a prepared statement.")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security · String-built SQL")).toBeInTheDocument();
    expect(screen.getByText("src/login.ts:12-14")).toBeInTheDocument();
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
  });

  it("added and removed diff lines carry their own style and markup in the diff renders as text", () => {
    const { container } = renderModal(makeCase());

    const added = container.querySelector('[data-kind="added"]') as HTMLElement;
    const removed = container.querySelector('[data-kind="removed"]') as HTMLElement;
    const context = container.querySelector('[data-kind="context"]') as HTMLElement;
    expect(added.textContent).toBe("+const b = query(<script>alert(1)</script>);");
    expect(removed.textContent).toBe("-const b = query(user);");
    expect(container.querySelectorAll('[data-kind="added"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-kind="removed"]')).toHaveLength(1);

    const styles = [added, removed, context].map((el) => el.getAttribute("style"));
    expect(new Set(styles).size).toBe(3);

    // The stored diff is data: markup in it is text, never an element.
    expect(container.querySelector("script")).toBeNull();
  });

  it("no control edits, saves or runs the case", () => {
    renderModal(makeCase({ last_result: result() }));

    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Close"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("a last result reads Last run passed or Last run failed with expected and matched counts, seconds and USD", () => {
    const { unmount } = renderModal(makeCase({ last_result: result() }));
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText(/expected 1, matched 1 · 2\.5s · \$0\.0123/)).toBeInTheDocument();
    unmount();

    renderModal(
      makeCase({
        expected_output: { ...makeCase().expected_output, type: "must_not_flag" },
        last_result: result({
          expectation_type: "must_not_flag",
          pass: false,
          matched: 2,
          duration_ms: 1200,
          cost_usd: 0.5,
        }),
      }),
    );
    expect(screen.getByText("Last run failed")).toBeInTheDocument();
    expect(screen.queryByText("Last run passed")).toBeNull();
    expect(screen.getByText(/expected 0, matched 2 · 1\.2s · \$0\.5000/)).toBeInTheDocument();
  });

  it("a case that never ran shows no last-result line", () => {
    renderModal(makeCase({ last_result: null }));
    expect(screen.queryByText("Last run passed")).toBeNull();
    expect(screen.queryByText("Last run failed")).toBeNull();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    renderModal(makeCase(), onClose);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
