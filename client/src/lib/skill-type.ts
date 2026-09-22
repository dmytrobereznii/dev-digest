/* skill-type.ts — the `SkillType` palette and value list, shared across segments.

   Promoted here from three byte-identical rung-0 copies (`SkillCard/constants.ts`,
   `SkillEditor/constants.ts`, `AgentEditor/_components/SkillsTab/constants.ts`).
   `frontend-architecture` § Constants: a constant used by two components in one
   route moves to the route's `constants.ts`; one used by two SEGMENTS — here
   `/skills` and `/agents` — moves to `src/lib/`.

   The colours are the artboard's (`screen_skills.jsx` → `SKILL_TYPE`); the
   labels live in `messages/en/skills.json` under `listItem.type.*`, so nothing
   user-facing is spelled here. */
import type { SkillType } from "@devdigest/shared";

/** Type → pill / tile colour. Transcribed from the artboard, not derived. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Fallback for a type outside the map (a contract widened ahead of this file). */
const FALLBACK_TYPE_COLOR = "var(--text-secondary)";

/**
 * The four `SkillType` values, written out as a local literal.
 *
 * Deliberately NOT read off the Zod enum: a *value* import from
 * `@devdigest/shared` type-checks and unit-tests green while `next build` fails
 * with `Module not found: Can't resolve './contracts/knowledge.js'`
 * (client INSIGHTS.md). Everything imported from `@devdigest/shared` here is a
 * type. Keep in step with `SkillType`.
 */
export const SKILL_TYPE_VALUES: readonly SkillType[] = [
  "rubric",
  "convention",
  "security",
  "custom",
];

/** Pill / tile colour for a skill type, with the fallback applied. */
export function skillTypeColor(type: SkillType): string {
  return SKILL_TYPE_COLOR[type] ?? FALLBACK_TYPE_COLOR;
}
