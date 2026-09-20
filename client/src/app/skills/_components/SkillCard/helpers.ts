import type { Skill, SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { FALLBACK_TYPE_COLOR, SKILL_SOURCE_ICON, SKILL_TYPE_COLOR } from "./constants";

/** Pill / tile colour for a skill type. */
export function typeColor(type: SkillType): string {
  return SKILL_TYPE_COLOR[type] ?? FALLBACK_TYPE_COLOR;
}

/** Icon shown beside the source label. */
export function sourceIcon(source: SkillSource): IconName {
  return SKILL_SOURCE_ICON[source] ?? "Edit";
}

/**
 * A skill needs vetting when it did NOT come from this workspace and has not
 * been turned on yet (spec D2). `source` is set once, at creation, so this is a
 * property of the row rather than of anything the card does.
 */
export function needsVetting(sk: Pick<Skill, "source" | "enabled">): boolean {
  return sk.source !== "manual" && !sk.enabled;
}
