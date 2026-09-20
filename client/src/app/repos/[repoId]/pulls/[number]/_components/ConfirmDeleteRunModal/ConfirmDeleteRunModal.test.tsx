/**
 * ConfirmDeleteRunModal — the point of replacing `window.confirm`.
 *
 * A native dialog cannot be driven by RTL, so the delete path had no test at
 * all: there was no way to assert that cancelling does NOT delete. These three
 * cases are what the modal buys.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
// fireEvent, not user-event: the repo does not carry that dependency and the
// existing component tests use fireEvent (see FindingsCell.test.tsx).
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { prReview as messages } from "@/test/messages";
import { ConfirmDeleteRunModal } from "./ConfirmDeleteRunModal";

afterEach(cleanup);

function renderModal(props: Partial<React.ComponentProps<typeof ConfirmDeleteRunModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ConfirmDeleteRunModal onConfirm={onConfirm} onClose={onClose} {...props} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDeleteRunModal", () => {
  it("states that the review and its findings go too — not just the run", () => {
    renderModal();
    expect(screen.getByText(messages.detail.deleteRun.title)).toBeInTheDocument();
    expect(screen.getByText(/findings/i)).toBeInTheDocument();
  });

  it("confirming deletes", () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: messages.detail.deleteRun.confirm }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancelling does NOT delete", () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: messages.detail.deleteRun.cancel }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("the confirm button is disabled while the delete is in flight", () => {
    renderModal({ pending: true });
    expect(
      screen.getByRole("button", { name: messages.detail.deleteRun.confirm }),
    ).toBeDisabled();
  });
});
