import { NO_VALUE } from "./constants";

/**
 * A 0..1 metric as a whole percentage, rounded half up on the decimal value.
 * `Math.round(0.825 * 100)` is 82 (binary error), so the product is nudged by
 * an epsilon first.
 */
export function toPct(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.floor(value * 100 + 0.5 + 1e-9);
}

/** A 0..1 metric as "83%", or "—" when it is null. */
export function formatPct(value: number | null | undefined): string {
  const pct = toPct(value);
  return pct == null ? NO_VALUE : `${pct}%`;
}

/** Difference of two displayed percentages, in points; null when either is null. */
export function pointDelta(
  newer: number | null | undefined,
  older: number | null | undefined,
): number | null {
  const a = toPct(newer);
  const b = toPct(older);
  if (a == null || b == null) return null;
  return a - b;
}

/** Drops null points, keeping order. */
export function definedPoints(points: ReadonlyArray<number | null | undefined>): number[] {
  return points.filter((p): p is number => p != null);
}

/** A run timestamp for a table cell, e.g. "Oct 10, 14:32". */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
