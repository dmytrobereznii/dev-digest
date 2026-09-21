import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "@/../messages/en/conventions.json";

const push = vi.fn();
const mutateAsync = vi.fn(async () => ({ id: "sk-new" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useCreateSkillFromConventions: () => ({ mutateAsync, isPending: false, isError: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    rule: "Always use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts:23-31",
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: true,
    status: "accepted",
  },
  {
    id: "c3",
    rule: "Redis access goes through src/lib/redis.ts singleton",
    evidence_path: "src/lib/redis.ts:1-9",
    evidence_snippet: "export const redis = new Redis(config.redisUrl);",
    confidence: 0.85,
    accepted: true,
    status: "accepted",
  },
];

/** The draft name for two accepted rules: named after the repo, not a rule. */
const DRAFT_NAME = "payments-api-conventions";

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillModal
        repoId="r1"
        repoName="payments-api"
        accepted={ACCEPTED}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("textbox", { name: `${DRAFT_NAME}.md` }) as HTMLTextAreaElement;
}

describe("conventions CreateSkillModal", () => {
  /* D1 — ONE skill from the whole accepted set, one `## ` section per rule.
     The slugs are the design's stop-word list at work. */
  it("drafts one merged body with a section per accepted rule", () => {
    const body = renderModal();
    const text = body.value;

    expect(text.startsWith(`# ${DRAFT_NAME}\n`)).toBe(true);
    expect(text).toContain("House conventions for `payments-api`.");
    expect(text.match(/^## /gm)).toHaveLength(ACCEPTED.length);
    expect(text).toContain("## async-await-then-chains");
    expect(text).toContain("## redis-access-goes-src");
    // The trailing period the design appends to every rule.
    expect(text).toContain("Always use async/await instead of .then() chains.");
    // Evidence travels with the rule, fenced.
    expect(text).toContain("Detected in `src/lib/redis.ts:1-9`:");
    expect(text).toContain("export const redis = new Redis(config.redisUrl);");

    // The merge banner — the one thing this modal has that the Skills Lab's
    // create modal does not.
    expect(screen.getByText("2 accepted conventions")).toBeInTheDocument();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
  });

  /* The draft is a starting point, not the payload: whatever is in the editor
     when Create skill is pressed is what gets written. */
  it("posts the edited body, not the draft", async () => {
    const body = renderModal();
    const draft = body.value;
    const edited = "# payments-api-conventions\n\nOnly the rule I kept.";
    fireEvent.change(body, { target: { value: edited } });

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      repoId: "r1",
      name: DRAFT_NAME,
      description: "2 house conventions extracted from payments-api",
      type: "convention",
      enabled: true,
      body: edited,
      convention_ids: ["c1", "c3"],
    });
    expect(mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ body: draft }));
    // Provenance is decided server-side (D8) — neither field is ever sent.
    expect(mutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.anything() }),
    );
    expect(mutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ source_is_external: expect.anything() }),
    );
    expect(push).toHaveBeenCalledWith("/skills/sk-new?tab=config");
  });
});
