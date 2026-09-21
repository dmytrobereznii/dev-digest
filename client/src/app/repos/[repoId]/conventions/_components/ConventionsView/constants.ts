/** Constants for the Conventions extractor page and its cards. */
import type { ConventionCategory, SkillType } from "@devdigest/shared";

/**
 * Confidence at or above which the card's bar turns green; below it, amber.
 * The artboard's own boundary, and the seeded fixtures straddle it on purpose
 * (0.91 and 0.85 green, 0.78 amber) so both colours are visible on a fresh
 * install.
 */
export const CONFIDENCE_OK_MIN = 0.85;

/** Placeholder cards shown while the TanStack Query fetch is in flight. */
export const SKELETON_CARDS = 3;

/** Card skeleton height (px) — a rule, an evidence box and a confidence row. */
export const SKELETON_CARD_HEIGHT = 148;

/** Width (px) of the confidence bar — the artboard's. */
export const CONFIDENCE_BAR_WIDTH = 90;

/** Width (px) of a card's Accept / Reject column — the artboard's. */
export const CARD_ACTIONS_WIDTH = 150;

/** Modal width (px) for the merge modal — the artboard's. */
export const MODAL_WIDTH = 760;

/** An extracted skill IS a convention skill; the select opens on it. */
export const DEFAULT_SKILL_TYPE: SkillType = "convention";

/**
 * The `ConventionCategory` values, written out as a local literal.
 *
 * Deliberately NOT read off the Zod enum in `@devdigest/shared`: a *value*
 * import from there type-checks and unit-tests green while `next build` fails
 * with `Module not found: Can't resolve './contracts/knowledge.js'` (client
 * INSIGHTS.md). Everything imported from `@devdigest/shared` on this page is a
 * type. Keep in step with `ConventionCategory`; the `category.*` message keys
 * are the labels.
 */
export const CONVENTION_CATEGORY_VALUES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "error-handling",
  "typing",
  "imports",
  "testing",
  "tooling",
  "other",
];
