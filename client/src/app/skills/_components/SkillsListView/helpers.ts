import type { Skill } from "@devdigest/shared";

/**
 * Case-insensitive filter over a skill's name + description, then sorted by
 * name.
 *
 * Sorting by name is spec D10: `data.jsx`'s `order: 1…6` is the lab list's
 * display order in the mock, not a column — `agent_skills.order` already owns
 * the ordering that reaches the prompt, and `skills` deliberately has none.
 */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  const list = q
    ? skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q))
    : [...skills];
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
