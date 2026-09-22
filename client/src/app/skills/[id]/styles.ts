import type { CSSProperties } from "react";

/* Route-rung styles for /skills/:id — the two-pane frame (card rail + editor).

   Rung 1: these belong to the route, not to `_components/SkillEditor`, because
   the page owns the split and the rail while the editor owns only its tab body
   (which keeps its own `styles.ts`). Same shape as the sibling route's
   `repos/[repoId]/pulls/[number]/styles.ts`.

   `tint` is the skill-type colour from `@/lib/skill-type`; the three keys that
   take it are functions so the palette stays in one place. */
export const s = {
  frame: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,

  // left: the skill rail
  rail: {
    width: 290,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  railHead: { padding: "14px 14px 10px" } satisfies CSSProperties,
  railHeadRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  railTitle: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  railList: { flex: 1, overflow: "auto", padding: "0 10px 10px" } satisfies CSSProperties,

  // right: the editor pane
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
  paneSkeleton: {
    flex: 1,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  paneHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 24px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  paneBody: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,

  iconBox: (tint: string): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: `${tint}1f`,
    color: tint,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  skillName: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  typePill: (tint: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color: tint,
    background: `${tint}1a`,
    padding: "2px 8px",
    borderRadius: 5,
  }),
} as const;
