/** Width of the filter box in the tab header. */
export const FILTER_WIDTH = 220;

/*
 * Reorder affordances: a linked row is draggable by its grip handle, using the
 * native HTML5 drag events — no drag-and-drop dependency for six rows. The ↑/↓
 * buttons stay beside it as the KEYBOARD path: `draggable` is mouse-only and
 * reachable by no assistive technology, so removing them would make ordering
 * impossible without a pointer. Their accessible names come from
 * `agents.skills.moveUp` / `moveDown`.
 *
 * Only LINKED rows are draggable. An unlinked skill has no position in the
 * prompt to move, so `reorderLink` treats a drop on one as a no-op too — the
 * rule is enforced in the data, not only by not setting the attribute.
 */
