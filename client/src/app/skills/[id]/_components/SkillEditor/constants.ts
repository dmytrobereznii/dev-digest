import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * Editor tabs — Config and Versions only.
 *
 * The design draws five (`Config · Preview · Evals · Stats · Versions`); the
 * other three are deferred on purpose (spec D7): Preview is polish (the body is
 * already legible in `CodeEditor`), Evals needs the L06 eval pipeline, and
 * Stats needs per-skill run attribution nothing records yet. A disabled or
 * placeholder tab would be a dead control, so they are absent rather than
 * greyed out. The route's `VALID_TABS` is derived from this list.
 */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "GitCommit" },
];

/**
 * The four `SkillType` values, written out as a local literal.
 *
 * Deliberately NOT read off the Zod enum: a *value* import from
 * `@devdigest/shared` type-checks and unit-tests green while `next build` fails
 * with `Module not found: Can't resolve './contracts/knowledge.js'`
 * (client INSIGHTS.md). Everything from `@devdigest/shared` here is a type.
 */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type tint, transcribed from `screen_skills.jsx`'s `SKILL_TYPE`. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};
