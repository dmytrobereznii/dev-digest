/** Constants for the brief module. */

/** Output caps (AC-84 to AC-86). Enforced by `BriefOutput`, stated to the model in the prompt. */
export const MAX_SUMMARY_CHARS = 400;
export const MAX_RISKS = 6;
export const MAX_REVIEW_FOCUS = 6;

/** Risk kinds the client has an icon for (design: screen_pr_detail.jsx), plus the catch-all. */
export const RISK_KINDS = ['security', 'db_migration', 'breaking_api', 'perf', 'deps'] as const;
export const RISK_KIND_OTHER = 'other';

/** Prompt-size caps: the review prompt's description limit, and a bound on the file list. */
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_LISTED_FILES = 200;

export const BRIEF_PROMPT_TEMPLATE = 'brief.system.md';
export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_TIMEOUT_MS = 90_000;

/** Generation requests per minute per client (NFR-1) — the intent derivation's limit. */
export const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
