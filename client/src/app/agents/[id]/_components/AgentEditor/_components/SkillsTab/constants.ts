import type { SkillType } from "@devdigest/shared";

/**
 * Type tint for the row pill, transcribed from `screen_agents.jsx`'s inline
 * map (the same four colours `screen_skills.jsx` uses).
 *
 * Written as a local literal rather than derived from the `SkillType` Zod enum:
 * a *value* import from `@devdigest/shared` passes typecheck and vitest while
 * breaking `next build` (client INSIGHTS.md).
 */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Width of the filter box in the tab header. */
export const FILTER_WIDTH = 220;

/*
 * Reorder affordances: dragging is the artboard's affordance, ↑/↓ buttons are
 * what ship — ordering is the feature, and six rows do not justify a
 * drag-and-drop dependency. The `cursor: grab` handle stays as the visual cue.
 * Their accessible names come from `agents.skills.moveUp` / `moveDown`.
 */
