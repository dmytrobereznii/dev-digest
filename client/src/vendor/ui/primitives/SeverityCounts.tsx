import React from "react";
import { Icon } from "../icons";
import { SEV, type Severity } from "./tokens";

/** Display order. INFO is in the token union but never in review data. */
const ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/**
 * Read-only per-severity finding counts: icon + number per level, in the
 * severity's colour with a dotted underline (the PR list's Findings column and
 * the run timeline).
 *
 * Only non-zero levels draw — this summarises a review, it is not a filter, so
 * a stable three-slot shape buys nothing (the filter row is `Chip`). When every
 * level is zero or `counts` is missing, `empty` renders instead.
 */
export function SeverityCounts({
  counts,
  size = 12,
  empty = null,
}: {
  counts: Partial<Record<Severity, number>> | null | undefined;
  /** Icon size in px. */
  size?: number;
  empty?: React.ReactNode;
}) {
  const shown = ORDER.filter((sv) => (counts?.[sv] ?? 0) > 0);
  if (shown.length === 0) return <>{empty}</>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content" }}>
      {shown.map((sv) => {
        const s = SEV[sv];
        const I = Icon[s.icon];
        const n = counts![sv]!;
        const label = `${n} ${s.label.toLowerCase()}`;
        return (
          <span
            key={sv}
            role="img"
            aria-label={label}
            title={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11.5,
              fontWeight: 600,
              color: s.c,
              borderBottom: `1px dotted ${s.c}`,
              paddingBottom: 1,
            }}
          >
            <I size={size} />
            <span className="tnum">{n}</span>
          </span>
        );
      })}
    </span>
  );
}
