import { describe, it, expect } from "vitest";
import type { ProjectDocument } from "@devdigest/shared";
import { filterDocuments, missingPaths, serializeSpecList, sumTokens } from "./helpers";

const doc = (path: string, tokens: number): ProjectDocument => ({
  path,
  type: "specs",
  tokens,
  used_by_agents: 0,
});

const DOCS = [doc("specs/Auth-Flow.md", 100), doc("docs/readme.md", 20), doc("specs/billing.md", 3)];

describe("project-context helpers", () => {
  it("filterDocuments matches the path ignoring case", () => {
    expect(filterDocuments(DOCS, "AUTH").map((d) => d.path)).toEqual(["specs/Auth-Flow.md"]);
    expect(filterDocuments(DOCS, "SPECS/").map((d) => d.path)).toEqual([
      "specs/Auth-Flow.md",
      "specs/billing.md",
    ]);
    expect(filterDocuments(DOCS, "nomatch")).toEqual([]);
  });

  it("sumTokens adds only the checked documents", () => {
    expect(sumTokens(DOCS, ["specs/Auth-Flow.md", "specs/billing.md"])).toBe(103);
    expect(sumTokens(DOCS, [])).toBe(0);
    // A checked path the list does not contain contributes nothing.
    expect(sumTokens(DOCS, ["docs/readme.md", "gone.md"])).toBe(20);
  });

  it("missingPaths returns attached paths that are no longer listed", () => {
    expect(missingPaths(["docs/readme.md", "gone.md", "also/gone.md"], DOCS)).toEqual([
      "gone.md",
      "also/gone.md",
    ]);
    expect(missingPaths(["docs/readme.md"], DOCS)).toEqual([]);
  });

  it("serializeSpecList is the heading and one path line per attachment in order", () => {
    expect(serializeSpecList(["b.md", "a/c.md"])).toBe(
      "## Project specifications\n- b.md\n- a/c.md",
    );
  });
});
