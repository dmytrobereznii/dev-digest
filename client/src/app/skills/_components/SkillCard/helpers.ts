import type { Skill, SkillSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { SKILL_SOURCE_ICON } from "./constants";

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
