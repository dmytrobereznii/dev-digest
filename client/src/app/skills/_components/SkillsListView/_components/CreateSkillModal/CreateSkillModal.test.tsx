import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en/skills.json";

const push = vi.fn();
const mutateAsync = vi.fn(async () => ({ id: "sk-new" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false, isError: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CreateSkillModal onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

const BODY = "# api-contract-gate\n\nFlag breaking route changes.";

describe("CreateSkillModal", () => {
  it("creates a manual skill from a typed body", async () => {
    renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "skill.md" }), { target: { value: BODY } });
    fireEvent.click(screen.getByText("Create skill"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ body: BODY, enabled: true, source_is_external: false }),
    );
    // The client never names a `source` — the server maps the boolean (D2).
    expect(mutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.anything() }),
    );
  });

  /* D2 — the edge the whole trust segment turns on: the provenance checkbox
     does not merely default Enabled off, it takes the control away. */
  it("takes the Enabled toggle away and posts source_is_external when the body is third-party", async () => {
    renderModal();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("checkbox"));

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.parentElement).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(messages.preview.untrustedNotice)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "skill.md" }), { target: { value: BODY } });
    fireEvent.click(screen.getByText("Create skill"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, source_is_external: true }),
    );
  });
});
