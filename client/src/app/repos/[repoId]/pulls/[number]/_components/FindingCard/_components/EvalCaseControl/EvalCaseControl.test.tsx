import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import { prReview } from "@/test/messages";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a) } }));

import { EvalCaseControl } from "./EvalCaseControl";

const ACTION = prReview.finding.evalCase.action;
const CREATED = prReview.finding.evalCase.created;
const HINT = prReview.finding.evalCase.needsDecision;
const CASE = { id: "case-1" };

beforeEach(() => {
  post.mockReset();
});
afterEach(cleanup);

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "r",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    eval_case_id: null,
    ...over,
  } as FindingRecord;
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const control = () => screen.getByRole("button", { name: new RegExp(`${ACTION}|${CREATED}`) });

describe("EvalCaseControl", () => {
  it("an undecided finding renders the control disabled with the explanation as its accessible description", () => {
    render(wrap(<EvalCaseControl f={finding()} />));
    const btn = control();
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(HINT);
    expect(screen.getByText(HINT)).toBeVisible();
    fireEvent.click(btn);
    expect(post).not.toHaveBeenCalled();
  });

  it("an accepted finding: activating the control sends one creation request for that finding", async () => {
    post.mockResolvedValue(CASE);
    render(wrap(<EvalCaseControl f={finding({ accepted_at: "2026-10-10T00:00:00Z" })} />));
    expect(control()).toBeEnabled();
    fireEvent.click(control());
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0] ?? [];
    expect(path).toBe("/findings/f1/eval-case");
    expect(body).toEqual({ finding_id: "f1" });
  });

  it("a dismissed finding renders the control enabled", () => {
    render(wrap(<EvalCaseControl f={finding({ dismissed_at: "2026-10-10T00:00:00Z" })} />));
    const btn = control();
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("a finding with eval_case_id renders the created state and activating it sends no request", () => {
    render(
      wrap(<EvalCaseControl f={finding({ accepted_at: "2026-10-10T00:00:00Z", eval_case_id: "case-1" })} />),
    );
    const btn = screen.getByRole("button", { name: CREATED });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: ACTION })).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(post).not.toHaveBeenCalled();
  });

  it("after a successful creation the refreshed finding shows the created state", async () => {
    // The finding comes from a query the mutation invalidates, like the real review list.
    let stored = finding({ dismissed_at: "2026-10-10T00:00:00Z" });
    post.mockImplementation(async () => {
      stored = { ...stored, eval_case_id: "case-1" };
      return CASE;
    });
    function Host() {
      const { data } = useQuery({ queryKey: ["reviews", "r1"], queryFn: async () => stored });
      return data ? <EvalCaseControl f={data} /> : null;
    }
    render(wrap(<Host />));
    fireEvent.click(await screen.findByRole("button", { name: ACTION }));
    const created = await screen.findByRole("button", { name: CREATED });
    expect(created).toHaveAttribute("aria-disabled", "true");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a failed creation shows the API's message and leaves the control enabled", async () => {
    post.mockImplementation(async () => { throw new Error("Finding already has an eval case"); });
    render(wrap(<EvalCaseControl f={finding({ accepted_at: "2026-10-10T00:00:00Z" })} />));
    fireEvent.click(control());
    expect(await screen.findByRole("alert")).toHaveTextContent("Finding already has an eval case");
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).toHaveTextContent(ACTION);
  });

  it("eval_case_id back to null renders the control enabled again", () => {
    const base = finding({ dismissed_at: "2026-10-10T00:00:00Z", eval_case_id: "case-1" });
    const { rerender } = render(wrap(<EvalCaseControl f={base} />));
    expect(screen.getByRole("button", { name: CREATED })).toHaveAttribute("aria-disabled", "true");
    // Same tree shape and QueryClient: rerender with the case deleted.
    rerender(
      wrap(<EvalCaseControl f={{ ...base, eval_case_id: null }} />),
    );
    const btn = screen.getByRole("button", { name: ACTION });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-disabled");
  });
});
