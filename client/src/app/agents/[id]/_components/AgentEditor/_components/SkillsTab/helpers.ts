import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the tab: a workspace skill and whether this agent links it. */
export interface SkillRow {
  skill: Skill;
  linked: boolean;
}

/**
 * Linked skills first, in their link `order` (that order is what the assembled
 * prompt uses); unlinked skills follow alphabetically.
 */
export function orderSkills(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const order = new Map(links.map((l) => [l.skill_id, l.order]));
  const linked = skills
    .filter((sk) => order.has(sk.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((skill) => ({ skill, linked: true }));
  const rest = skills
    .filter((sk) => !order.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false }));
  return [...linked, ...rest];
}

/** Link/unlink, as a whole-set edit: a new skill is appended last. */
export function toggleLink(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Move a linked skill by `delta` places. Out-of-range moves are no-ops. */
export function moveLink(ids: string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/**
 * Move `dragId` to `overId`'s position. Both must be linked; anything else —
 * a drop on an unlinked row, on itself, or on a row that is not in the set —
 * is a no-op returning the SAME array, which the caller uses to skip the POST.
 *
 * Deliberately keyed on ids rather than on the rendered indices: the filter box
 * hides rows, so the visible index of a row is not its index in the link order.
 */
export function reorderLink(ids: string[], dragId: string, overId: string): string[] {
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Filter is display-only — it never narrows what gets POSTed. */
export function matchesFilter(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q);
}
