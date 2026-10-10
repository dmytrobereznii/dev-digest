/** How often a running eval run is re-read, in milliseconds. */
export const EVAL_POLL_MS = 2000;

/** Placeholder shown for a value that is null or unknown. */
export const NO_VALUE = "—";

/** Theme colour of each metric's bar, sparkline and trend series. */
export const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;
