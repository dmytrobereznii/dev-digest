import React from "react";

/**
 * USD spend, formatted for a dense table cell.
 *
 * One rule for every surface (the design artboards use three different
 * precisions; this supersedes them):
 *   null/undefined -> em-dash   ($ is meaningless when nothing ran)
 *   >= $1          -> 2 decimals ($12.35)
 *   <  $1          -> 3 decimals ($0.014)
 *   sub-milli-dollar amounts get a 4th decimal rather than rounding to
 *   "$0.000", because a cheap run costing something is not a run costing
 *   nothing ($0.0013).
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd > 0 && usd < 0.0005) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/** Compact spend display. `usd` null/undefined => em-dash (no priced run yet). */
export function CostBadge({
  usd,
  tokens,
  size = "sm",
  muted,
}: {
  usd: number | null | undefined;
  /** Optional trailing detail, e.g. a token count. */
  tokens?: React.ReactNode;
  size?: "sm" | "lg";
  muted?: boolean;
}) {
  if (usd == null) {
    return (
      <span className="mono" style={{ fontSize: size === "lg" ? 13 : 12, color: "var(--text-muted)" }}>
        —
      </span>
    );
  }
  return (
    <span
      className="mono tnum"
      title="Cost of this review"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: size === "lg" ? 13 : 11.5,
        color: muted ? "var(--text-muted)" : "var(--text-secondary)",
        fontWeight: 500,
      }}
    >
      {formatUsd(usd)}
      {tokens ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{tokens}</span> : null}
    </span>
  );
}
