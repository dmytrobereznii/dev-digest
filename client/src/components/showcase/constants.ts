import type { Severity } from "@devdigest/ui";

/** Constants for the Showcase Gallery (dev-only). */

export const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"];

export const CATEGORIES = ["bug", "security", "perf", "style", "test"] as const;

export const MODEL_OPTIONS = ["gpt-4.1", "gpt-4o", "claude-sonnet"] as const;

/** A short Markdown skill body for the CodeEditor showcase. */
export const SAMPLE_SKILL_BODY = [
  "# PR quality rubric",
  "",
  "Score each pull request against the rules below.",
  "",
  "- Prefer a named edge case over a restated happy path.",
  "- Cap the review at five high-signal findings.",
  "1. Correctness",
  "2. Readability",
].join("\n");
