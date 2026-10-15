import { describe, it, expect } from "vitest";
import { toPct, formatPct, pointDelta, definedPoints } from "./helpers";
import { METRIC_COLOR } from "./constants";

describe("eval helpers", () => {
  it("toPct rounds half up: 0.825 is 83, 0.285 is 29, 0.004 is 0", () => {
    expect(toPct(0.825)).toBe(83);
    expect(toPct(0.285)).toBe(29);
    expect(toPct(0.004)).toBe(0);
    expect(toPct(0.5)).toBe(50);
    expect(toPct(1)).toBe(100);
    expect(toPct(null)).toBeNull();
  });

  it("formatPct renders — for null", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(0.825)).toBe("83%");
    expect(formatPct(0)).toBe("0%");
  });

  it("pointDelta is the difference of two displayed percentages, and null when either is null", () => {
    expect(pointDelta(0.83, 0.75)).toBe(8);
    expect(pointDelta(0.75, 0.83)).toBe(-8);
    expect(pointDelta(0.5, 0.5)).toBe(0);
    // difference of the DISPLAYED values: 0.825 -> 83, 0.744 -> 74
    expect(pointDelta(0.825, 0.744)).toBe(9);
    expect(pointDelta(null, 0.5)).toBeNull();
    expect(pointDelta(0.5, null)).toBeNull();
  });

  it("definedPoints drops null points and keeps order", () => {
    expect(definedPoints([0.2, null, 0.9, undefined, 0, 0.5])).toEqual([0.2, 0.9, 0, 0.5]);
    expect(definedPoints([null, null])).toEqual([]);
  });

  it("METRIC_COLOR maps recall, precision and citation to --accent, --ok and --warn", () => {
    expect(METRIC_COLOR.recall).toBe("var(--accent)");
    expect(METRIC_COLOR.precision).toBe("var(--ok)");
    expect(METRIC_COLOR.citation).toBe("var(--warn)");
  });
});
