/** Constants for CreateSkillModal. */
import type { SkillType } from "@devdigest/shared";

/** Type a new skill gets unless the author picks another. */
export const DEFAULT_SKILL_TYPE: SkillType = "custom";

/** Modal width (px) — the artboard's (`screen_conv_conf.jsx`). */
export const MODAL_WIDTH = 760;

/** Filename stem shown in the editor header before a name is typed. */
export const FILENAME_FALLBACK = "skill";
