/** Constants for the brief module. */

/** Output caps (AC-84 to AC-86). Enforced by `BriefOutput`, stated to the model in the prompt. */
export const MAX_SUMMARY_CHARS = 400;
export const MAX_RISKS = 6;
export const MAX_REVIEW_FOCUS = 6;

export const BRIEF_PROMPT_TEMPLATE = 'brief.system.md';
export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_TIMEOUT_MS = 90_000;

/** Generation requests per minute per client (NFR-1) — the intent derivation's limit. */
export const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
