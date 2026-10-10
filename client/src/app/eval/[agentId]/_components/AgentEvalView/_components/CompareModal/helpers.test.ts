import { describe, it, expect } from "vitest";
import { diffLines, caseSetDifference, formatUsd } from "./helpers";

describe("diffLines", () => {
  it("lines only in the older text are removed and lines only in the newer text are added, in order", () => {
    expect(diffLines("a\nold1\nold2", "a\nnew1")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "old1" },
      { kind: "removed", text: "old2" },
      { kind: "added", text: "new1" },
    ]);
  });

  it("identical texts give no added or removed line", () => {
    const out = diffLines("one\ntwo\nthree", "one\ntwo\nthree");
    expect(out).toHaveLength(3);
    expect(out.every((l) => l.kind === "same")).toBe(true);
  });

  it("a line inserted in the middle leaves the lines around it unchanged", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "added", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });
});

describe("caseSetDifference", () => {
  it("counts ids present in only one side, whatever the totals", () => {
    expect(caseSetDifference(["a", "b"], ["b", "c"])).toEqual({ onlyOlder: 1, onlyNewer: 1 });
    expect(caseSetDifference(["a"], ["a"])).toEqual({ onlyOlder: 0, onlyNewer: 0 });
  });
});

describe("formatUsd", () => {
  it("shows four decimals", () => {
    expect(formatUsd(0.0125)).toBe("$0.0125");
  });
});
