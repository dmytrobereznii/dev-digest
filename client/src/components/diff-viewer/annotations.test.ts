/**
 * annotations.ts (D7, spec 08) is diff-viewer's generic seam for attaching
 * arbitrary (marker, node) pairs to a rendered line, without this rung
 * importing FindingCard. `partitionAnnotations` mirrors `partitionThreads`
 * (comments.ts) — same matched/unanchored split, keyed the same way — and
 * additionally spreads a range annotation's marker over every rendered key
 * in its `keys` list while keeping the `node` on only the last one (Fix 1).
 */
import { describe, it, expect } from "vitest";
import { keysForLine, lineKey } from "./comments";
import type { Line } from "./helpers";
import { partitionAnnotations, type LineAnnotation } from "./annotations";

function annotation(
  o: Partial<LineAnnotation> & Pick<LineAnnotation, "id" | "keys">,
): LineAnnotation {
  return { marker: null, node: null, ...o };
}

describe("partitionAnnotations", () => {
  it("matches an annotation keyed to a rendered RIGHT:<new line>", () => {
    const ln: Line = { kind: "add", text: "x", newNo: 12 };
    const renderedKeys = new Set(keysForLine(ln));
    const a = annotation({ id: "f1", keys: [lineKey("RIGHT", 12)!] });

    const { matched, unanchored } = partitionAnnotations([a], renderedKeys);

    expect(matched.get(lineKey("RIGHT", 12)!)).toEqual([a]);
    expect(unanchored).toEqual([]);
  });

  it("sends an annotation whose key is not a rendered line to unanchored", () => {
    const ln: Line = { kind: "add", text: "x", newNo: 12 };
    const renderedKeys = new Set(keysForLine(ln));
    const a = annotation({ id: "f1", keys: [lineKey("RIGHT", 999)!] });

    const { matched, unanchored } = partitionAnnotations([a], renderedKeys);

    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([a]);
  });

  it("groups several annotations that share a line under the same key", () => {
    const key = lineKey("RIGHT", 5)!;
    const renderedKeys = new Set([key]);
    const a = annotation({ id: "a", keys: [key] });
    const b = annotation({ id: "b", keys: [key] });

    const { matched } = partitionAnnotations([a, b], renderedKeys);

    expect(matched.get(key)).toEqual([a, b]);
  });

  it("mirrors partitionThreads: every annotation lands in exactly one bucket", () => {
    const renderedKeys = new Set([lineKey("RIGHT", 1)!]);
    const matchedAnn = annotation({ id: "m", keys: [lineKey("RIGHT", 1)!] });
    const unanchoredAnn = annotation({ id: "u", keys: [lineKey("LEFT", 1)!] });

    const { matched, unanchored } = partitionAnnotations([matchedAnn, unanchoredAnn], renderedKeys);

    expect([...matched.values()].flat()).toEqual([matchedAnn]);
    expect(unanchored).toEqual([unanchoredAnn]);
  });

  describe("range annotations (Fix 1)", () => {
    it("marks every rendered key of a range, keeping the node only on the last one", () => {
      const keys = [lineKey("RIGHT", 2)!, lineKey("RIGHT", 3)!];
      const renderedKeys = new Set(keys);
      const marker = { color: "var(--warn)", label: "warning", icon: "AlertTriangle" as const };
      const a = annotation({ id: "range", keys, marker, node: "the card" });

      const { matched, unanchored } = partitionAnnotations([a], renderedKeys);

      expect(matched.get(keys[0]!)).toEqual([{ ...a, node: null }]);
      expect(matched.get(keys[1]!)).toEqual([a]);
      expect(unanchored).toEqual([]);
    });

    it("drops the unrendered keys of a partially-rendered range and keeps the node on the last rendered one", () => {
      // Only line 2 of a 2..4 range is rendered in this diff.
      const keys = [lineKey("RIGHT", 2)!, lineKey("RIGHT", 3)!, lineKey("RIGHT", 4)!];
      const renderedKeys = new Set([keys[0]!]);
      const a = annotation({ id: "partial", keys, node: "the card" });

      const { matched, unanchored } = partitionAnnotations([a], renderedKeys);

      expect(matched.get(keys[0]!)).toEqual([a]);
      expect(matched.has(keys[1]!)).toBe(false);
      expect(matched.has(keys[2]!)).toBe(false);
      expect(unanchored).toEqual([]);
    });

    it("sends a range with no rendered key to unanchored exactly once", () => {
      const keys = [lineKey("RIGHT", 50)!, lineKey("RIGHT", 51)!];
      const renderedKeys = new Set<string>();
      const a = annotation({ id: "outside", keys, node: "the card" });

      const { matched, unanchored } = partitionAnnotations([a], renderedKeys);

      expect(matched.size).toBe(0);
      expect(unanchored).toEqual([a]);
    });
  });
});
