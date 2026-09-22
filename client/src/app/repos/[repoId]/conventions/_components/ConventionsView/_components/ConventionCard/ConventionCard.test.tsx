import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "@/../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const C: ConventionCandidate = {
  id: "c1",
  category: "error-handling",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts:23-31",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  accepted: false,
  status: "pending",
};

function renderCard(c: ConventionCandidate = C) {
  const onSetStatus = vi.fn();
  const onEdit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard c={c} onSetStatus={onSetStatus} onEdit={onEdit} />
    </NextIntlClientProvider>,
  );
  return { onSetStatus, onEdit };
}

/**
 * The ProgressBar's coloured fill, reached from the percentage beside it
 * (`<span>90px wrapper</span>` → track → fill). Anchored on visible copy rather
 * than a test-only attribute, since the kit exposes no handle of its own.
 */
function barFill(percent: string): HTMLElement {
  const wrapper = screen.getByText(percent).previousElementSibling;
  return wrapper!.firstElementChild!.firstElementChild as HTMLElement;
}

describe("ConventionCard", () => {
  it("renders the rule, the evidence path, the snippet and the confidence", () => {
    renderCard();
    expect(screen.getByText(C.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("accepts with the candidate's id", () => {
    const { onSetStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onSetStatus).toHaveBeenCalledWith("c1", "accepted");
  });

  /* D2: Accept toggles, Reject is terminal — so an accepted card's primary
     button hands back `pending`, and Reject is `rejected` either way. */
  it("toggles an accepted card back to pending", () => {
    const { onSetStatus } = renderCard({ ...C, accepted: true, status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onSetStatus).toHaveBeenCalledWith("c1", "pending");
  });

  it("rejects with `rejected`", () => {
    const { onSetStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onSetStatus).toHaveBeenCalledWith("c1", "rejected");
  });

  /* The 0.85 boundary is the artboard's, and the seeds straddle it on purpose —
     so the two sides are the edge worth pinning. */
  it("colours the confidence bar green at the threshold and amber below it", () => {
    renderCard({ ...C, confidence: 0.85 });
    expect(barFill("85%")).toHaveStyle({ background: "var(--ok)" });
    cleanup();

    renderCard({ ...C, confidence: 0.78 });
    expect(barFill("78%")).toHaveStyle({ background: "var(--warn)" });
  });

  it("labels the rule with the category the model filed it under", () => {
    renderCard();
    expect(screen.getByText("error handling")).toBeInTheDocument();

    // A row extracted before the column existed simply has no label.
    cleanup();
    renderCard({ ...C, category: null });
    expect(screen.queryByText("error handling")).not.toBeInTheDocument();
  });

  /* Criteria 47/49: Edit is the third button and it edits IN PLACE — the rule
     becomes a field on the same card, with no navigation and no modal. */
  it("edits the rule and the category inline, and saves the pair", () => {
    const { onEdit } = renderCard();

    // Read-only until Edit is pressed.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const field = screen.getByRole("textbox", { name: "Rule" });
    expect(field).toHaveValue(C.rule);
    // The evidence stays put and stays read-only while the rule is edited.
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText(C.evidence_snippet)).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "Use async/await, never .then() chains" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "structure" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith("c1", {
      rule: "Use async/await, never .then() chains",
      category: "structure",
    });
  });

  it("discards an edit on Cancel and does not re-open with the stale text", () => {
    const { onEdit } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rule" }), {
      target: { value: "typed then abandoned" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(C.rule)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Rule" })).toHaveValue(C.rule);
  });
});
