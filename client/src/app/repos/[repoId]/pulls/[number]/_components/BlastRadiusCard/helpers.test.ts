/** BlastRadiusCard/helpers.ts — spec 10 §6.2, T5. */
import { describe, it, expect } from "vitest";
import type { BlastCaller, ChangedSymbol } from "@devdigest/shared";
import { getCallerHref, getSymbolLabel } from "./helpers";

const CHANGED: ChangedSymbol[] = [
  { name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" },
  { name: "RateLimiter", file: "src/mw/rateLimit.ts", kind: "class" },
  { name: "check", file: "src/mw/rateLimit.ts", kind: "method" },
];

const CALLER: BlastCaller = { name: "handler", file: "a/b.ts", line: 12 };

describe("getSymbolLabel", () => {
  it("adds () for a function kind", () => {
    expect(getSymbolLabel("rateLimit", CHANGED)).toBe("rateLimit()");
  });

  it("adds () for a method kind", () => {
    expect(getSymbolLabel("check", CHANGED)).toBe("check()");
  });

  it("leaves a non-callable kind bare", () => {
    expect(getSymbolLabel("RateLimiter", CHANGED)).toBe("RateLimiter");
  });

  it("leaves an unmatched symbol bare", () => {
    expect(getSymbolLabel("unknownSymbol", CHANGED)).toBe("unknownSymbol");
  });
});

describe("getCallerHref", () => {
  it("builds a github blob URL pinned to the given sha", () => {
    expect(getCallerHref("o/r", "sha123", CALLER)).toBe(
      "https://github.com/o/r/blob/sha123/a/b.ts#L12",
    );
  });

  it("returns null with no repo name", () => {
    expect(getCallerHref(null, "sha123", CALLER)).toBeNull();
  });

  it("returns null with no sha", () => {
    expect(getCallerHref("o/r", null, CALLER)).toBeNull();
  });
});
