import { describe, it, expect } from "vitest";
import { brief } from "./messages";

// NFR-5: the Intent and Blast radius cards read these keys from the `brief`
// namespace. Their text is pinned verbatim so a copy change shows up here.
describe("brief messages", () => {
  it("brief.json keeps every key the Intent and Blast radius cards read", () => {
    expect(brief.block.blast).toBe("Blast radius");
    expect(brief.intent).toMatchObject({
      title: "Intent",
      inScope: "IN SCOPE",
      outOfScope: "OUT OF SCOPE",
      nothingStated: "Nothing stated",
      inferredFrom: "Inferred from: {signals}",
      sources: "Sources",
      derive: "Derive intent",
      rederive: "Re-derive",
      deriving: "Deriving…",
      stale: "Stale — the PR has changed since this was derived",
      empty: "No intent yet",
    });
    expect(brief.intent.confidence).toEqual({
      high: "High confidence · documented",
      medium: "Medium confidence · partially documented",
      low: "Low confidence · inferred",
    });
    expect(brief.intent.skip).toEqual({
      external_not_fetched: "not fetched",
      cross_repo: "different repo, not followed",
      outside_repo: "outside the repo",
      unsupported_type: "unsupported file type",
      not_found: "not found",
      no_clone: "repo not cloned",
      github_unavailable: "GitHub unavailable",
      fetch_failed: "fetch failed",
      limit_reached: "reference limit reached",
    });
  });
});
