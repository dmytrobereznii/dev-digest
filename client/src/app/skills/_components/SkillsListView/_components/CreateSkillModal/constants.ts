/** Constants for CreateSkillModal. */
import type { SkillType } from "@devdigest/shared";

/**
 * The four skill types, written out as a literal rather than read off the Zod
 * `SkillType` enum: a VALUE import from @devdigest/shared type-checks and
 * unit-tests green while `next build` fails with
 * `Module not found: Can't resolve './contracts/knowledge.js'` (spec §5.7).
 * The `satisfies` keeps this list honest against the contract at compile time.
 */
export const SKILL_TYPE_VALUES = ["rubric", "convention", "security", "custom"] as const satisfies readonly SkillType[];

/** Type a new skill gets unless the author picks another. */
export const DEFAULT_SKILL_TYPE: SkillType = "custom";

/** Modal width (px) — the artboard's (`screen_conv_conf.jsx`). */
export const MODAL_WIDTH = 760;

/** Filename stem shown in the editor header before a name is typed. */
export const FILENAME_FALLBACK = "skill";
