/** URL-state helpers for the PR route (AC-66, AC-74, D15). */
import { describe, it, expect } from "vitest";
import { focusTargetQuery, getTabChangeQuery, parseDiffTarget } from "./helpers";

describe("PR route URL helpers", () => {
  it("G1 focusTargetQuery sets tab=diff, file and line and keeps other params", () => {
    const out = focusTargetQuery(new URLSearchParams("tab=overview&foo=bar&line=3"), "src/a b.ts", 42);

    expect(out.get("tab")).toBe("diff");
    expect(out.get("file")).toBe("src/a b.ts");
    expect(out.get("line")).toBe("42");
    expect(out.get("foo")).toBe("bar");
    // Round trip: a reload parses the same target back out of the URL.
    expect(parseDiffTarget(new URLSearchParams(out.toString()))).toEqual({ file: "src/a b.ts", line: 42 });
  });

  it("G2 parseDiffTarget reads file and line, and a missing or invalid line is null", () => {
    const parse = (q: string) => parseDiffTarget(new URLSearchParams(q));

    expect(parse("file=src/a.ts&line=7")).toEqual({ file: "src/a.ts", line: 7 });
    expect(parse("file=src/a.ts")).toEqual({ file: "src/a.ts", line: null });
    for (const bad of ["0", "-3", "1.5", "abc", "", "7x"]) {
      expect(parse(`file=src/a.ts&line=${bad}`)).toEqual({ file: "src/a.ts", line: null });
    }
    expect(parse("line=7")).toBeNull();
    expect(parse("tab=diff")).toBeNull();
  });

  it("G3 changing tab drops file and line", () => {
    const out = getTabChangeQuery(new URLSearchParams("tab=diff&file=src/a.ts&line=7&foo=bar"), "overview");

    expect(out.get("tab")).toBe("overview");
    expect(out.has("file")).toBe(false);
    expect(out.has("line")).toBe(false);
    expect(out.get("foo")).toBe("bar");
  });
});
