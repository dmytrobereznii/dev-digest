/** Constants for SkillCard.
 *
 * The colours are the artboard's (`screen_skills.jsx` → `SKILL_TYPE`) and the
 * source icons its `SKILL_SOURCE` map; the labels for both live in
 * `messages/en/skills.json` (`listItem.type.*` / `listItem.source.*`). */
import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Type → pill colour. Transcribed from the artboard, not derived. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Source → the icon shown beside its label. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};

/** Fallback for a type outside the map (a contract widened ahead of this file). */
export const FALLBACK_TYPE_COLOR = "var(--text-secondary)";
