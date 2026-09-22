/**
 * Intent derivation — tunable thresholds and budgets. Values are the spec's
 * (D7 confidence thresholds, D10 truncation budgets, D5 reference limits).
 */

// ---- D7 — confidence thresholds (over `meaningfulText` character counts) ----
/** documentedChars at/above this → 'high'. */
export const CONFIDENCE_HIGH_CHARS = 300;
/** documentedChars at/above this (and below CONFIDENCE_HIGH_CHARS) → 'medium'. */
export const CONFIDENCE_MEDIUM_CHARS = 80;
/** Any single USED linked doc at/above this length also forces 'high'. */
export const CONFIDENCE_HIGH_DOC_CHARS = 200;

// ---- D10 — truncation budgets ----
/** PR body, before wrapping. */
export const MAX_BODY_CHARS = 6_000;
/** Each individual linked doc (issue/pull body, repo file), before wrapping. */
export const MAX_DOC_CHARS = 6_000;
/** All linked docs together, after each is capped at MAX_DOC_CHARS. */
export const MAX_ALL_DOCS_CHARS = 16_000;
/** First N commit messages considered. */
export const MAX_COMMITS = 30;
/** Each commit message, before wrapping. */
export const MAX_COMMIT_MESSAGE_CHARS = 300;
/** First N changed file paths considered. */
export const MAX_PATHS = 100;
/** Diff excerpt handed to the classifier, before wrapping. */
export const MAX_DIFF_EXCERPT_CHARS = 6_000;

// ---- D10 — the classifier call ----
export const CLASSIFIER_TIMEOUT_MS = 60_000;
export const CLASSIFIER_MAX_RETRIES = 1;

// ---- D5 — reference resolution ----
/** At most this many references are resolved; the rest are `limit_reached`. */
export const MAX_REFERENCES = 5;
/** Relative-path extensions treated as a linkable doc (D5/D6). */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'] as const;
export type DocExtension = (typeof DOC_EXTENSIONS)[number];
