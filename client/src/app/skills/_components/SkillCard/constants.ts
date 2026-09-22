/** Constants for SkillCard.

   The source icons are the artboard's `SKILL_SOURCE` map; their labels live in
   `messages/en/skills.json` (`listItem.source.*`). The TYPE palette is not here
   — `/agents` needs it too, so it sits in `@/lib/skill-type`. */
import type { SkillSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Source → the icon shown beside its label. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};
