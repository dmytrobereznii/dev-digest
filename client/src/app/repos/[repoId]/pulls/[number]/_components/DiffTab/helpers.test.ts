/**
 * DiffTab/helpers.ts — the pure Smart Diff view functions (spec 08 §7 step 6,
 * T6). Neither `getViewGroups` nor `getMarker` exists yet, so every case here
 * is expected to fail until the implementer adds `helpers.ts`.
 *
 * Spec §7 names the functions but not their full shape ("getViewGroups(files,
 * sd)", "getMarker(sev)"), so this test pins the contract the rest of the
 * step is built against:
 *
 *   getViewGroups(files: PrFile[], sd: SmartDiffResponse): ViewGroup[]
 *     One entry per role with at least one PrFile, in `SmartDiffRole.options`
 *     order (D3). Files inside a group keep `pr.files`'s relative order, not
 *     `sd`'s (D5). A path `sd` doesn't classify lands in "core" with no
 *     finding lines, and is never dropped (D5). A role `sd` lists with
 *     `files: []` produces no group (the route always returns five; the
 *     client hides empty ones — D3).
 *
 *   getMarker(findings: FindingRecord[], t: (key: string) => string): LineMarker | null
 *     The marker for the findings anchored to one line: the highest-severity
 *     *undismissed* finding wins, translated through `t`; null when every
 *     finding given is dismissed, or the list is empty (D9).
 */
import { describe, it, expect, vi } from "vitest";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, SmartDiffResponse } from "@devdigest/shared";
import { SmartDiffRole } from "@devdigest/shared";
import { SEV } from "@devdigest/ui";
import { getViewGroups, getMarker } from "./helpers";

function file(path: string, o: Partial<PrFile> = {}): PrFile {
  return { path, additions: 1, deletions: 0, patch: null, ...o };
}

/** Builds a full five-group SmartDiffResponse; unlisted roles come back empty, like the real route. */
function sdWith(
  groups: Partial<Record<SmartDiffRole, { path: string; findingLines?: number[] }[]>>,
): SmartDiffResponse {
  return {
    review_id: "rev1",
    groups: SmartDiffRole.options.map((role) => ({
      role,
      files: (groups[role] ?? []).map((f) => ({
        path: f.path,
        additions: 1,
        deletions: 0,
        finding_lines: f.findingLines ?? [],
      })),
    })),
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  };
}

describe("getViewGroups", () => {
  it("orders groups by SmartDiffRole.options and keeps pr.files's order inside each group", () => {
    const files = [file("b.ts"), file("a.ts"), file("z.test.ts")];
    // sd's own file order is reversed vs. `files` — the group must not use it.
    const sd = sdWith({
      core: [{ path: "a.ts" }, { path: "b.ts" }],
      tests: [{ path: "z.test.ts" }],
    });

    const groups = getViewGroups(files, sd);

    expect(groups.map((g) => g.role)).toEqual(["core", "tests"]);
    expect(groups[0]!.files.map((f) => f.file.path)).toEqual(["b.ts", "a.ts"]);
    expect(groups[1]!.files.map((f) => f.file.path)).toEqual(["z.test.ts"]);
  });

  it("drops a role the response lists with zero files", () => {
    const files = [file("a.ts")];
    const sd = sdWith({ core: [{ path: "a.ts" }] }); // every other role is [] by default

    const groups = getViewGroups(files, sd);

    expect(groups.map((g) => g.role)).toEqual(["core"]);
    expect(groups.some((g) => g.role === "docs")).toBe(false);
  });

  it("sends a path missing from the response to core, without dropping it", () => {
    const files = [file("a.ts"), file("mystery.ts")];
    const sd = sdWith({ core: [{ path: "a.ts" }] }); // mystery.ts is unclassified

    const groups = getViewGroups(files, sd);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.role).toBe("core");
    expect(groups[0]!.files.map((f) => f.file.path)).toEqual(["a.ts", "mystery.ts"]);
    expect(groups[0]!.files[1]!.findingLines).toEqual([]);
  });

  it("carries each file's finding_lines through from the response", () => {
    const files = [file("a.ts"), file("b.ts")];
    const sd = sdWith({
      core: [{ path: "a.ts", findingLines: [3, 12] }, { path: "b.ts" }],
    });

    const groups = getViewGroups(files, sd);

    expect(groups[0]!.files[0]!.findingLines).toEqual([3, 12]);
    expect(groups[0]!.files[1]!.findingLines).toEqual([]);
  });
});

describe("getMarker", () => {
  const identity = (key: string) => key;

  function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "severity">): FindingRecord {
    return {
      id: "f1",
      category: "bug",
      title: "t",
      file: "a.ts",
      start_line: 1,
      end_line: 1,
      rationale: "r",
      suggestion: null,
      confidence: 0.9,
      kind: null,
      trifecta_components: null,
      evidence: null,
      review_id: "r1",
      accepted_at: null,
      dismissed_at: null,
      ...o,
    } as FindingRecord;
  }

  it("returns null for a line with no findings", () => {
    expect(getMarker([], identity)).toBeNull();
  });

  it("returns null when the only finding on the line is dismissed", () => {
    const findings = [finding({ id: "f1", severity: "CRITICAL", dismissed_at: "2026-09-20T00:00:00Z" })];

    expect(getMarker(findings, identity)).toBeNull();
  });

  it("picks the highest-severity undismissed finding, skipping a dismissed one that would outrank it", () => {
    const findings = [
      finding({ id: "f1", severity: "CRITICAL", dismissed_at: "2026-09-20T00:00:00Z" }),
      finding({ id: "f2", severity: "WARNING" }),
      finding({ id: "f3", severity: "SUGGESTION" }),
    ];

    const marker = getMarker(findings, identity);

    expect(marker).not.toBeNull();
    expect(marker!.color).toBe(SEV.WARNING.c);
    expect(marker!.icon).toBe(SEV.WARNING.icon);
  });

  it("prefers CRITICAL over WARNING when both are undismissed", () => {
    const findings = [finding({ id: "f1", severity: "WARNING" }), finding({ id: "f2", severity: "CRITICAL" })];

    const marker = getMarker(findings, identity);

    expect(marker!.color).toBe(SEV.CRITICAL.c);
  });

  it("asks the translator for the severity's marker label and renders its return value", () => {
    const findings = [finding({ id: "f1", severity: "CRITICAL" })];
    const t = vi.fn((key: string) => `label-for:${key}`);

    const marker = getMarker(findings, t);

    expect(t).toHaveBeenCalledWith("smartDiff.marker.critical");
    expect(marker!.label).toBe("label-for:smartDiff.marker.critical");
  });
});
