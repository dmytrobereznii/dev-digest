/**
 * Caps and ordering shared by every tool (D9, D13, §6.5). Nothing here is
 * conditional on `detail` beyond the two named tables in D9 — the concise vs
 * full switch lives in `review-result.ts`, which imports these.
 */

/** Severity, worst first — the sort key and the `min_severity` narrowing
 * order share this list (D9/D8). */
export const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

// ---- D9: concise vs full caps ----------------------------------------------
export const CONCISE_MAX_FINDINGS = 15;
export const FULL_MAX_FINDINGS = 10;
export const CONCISE_RATIONALE_MAX = 300;
export const FULL_RATIONALE_MAX = 2000;
export const SUGGESTION_MAX = 2000;
export const SUMMARY_MAX = 600;

// ---- D13: sanitize caps for finding / convention fields --------------------
export const TITLE_MAX = 200;
export const FILE_MAX = 300;
export const CATEGORY_MAX = 60;
export const RULE_MAX = 500;

// ---- defence in depth: caps for fields D13 didn't originally list, echoed
// in tool output regardless (an agent's name/description, and a repo's
// full_name in output or in E2's known-repo list) --------------------------
export const AGENT_NAME_MAX = 200;
export const AGENT_DESCRIPTION_MAX = 500;
export const REPO_FULL_NAME_MAX = 200;

// ---- §6.5: get_conventions page cap -----------------------------------------
export const CONVENTIONS_MAX = 40;

// ---- D13: a relayed API/run error is redacted, sanitized, then cut here ----
export const RELAYED_ERROR_MAX = 500;
