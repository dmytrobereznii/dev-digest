/* annotations.ts — generic seam for attaching a marker + arbitrary node to a
   rendered diff line (D7, spec 08). Rung 2 (diff-viewer) cannot import
   route-rung components like FindingCard, so callers pass rendered nodes in
   instead — the diff viewer only knows how to place them.
   `partitionAnnotations` mirrors `partitionThreads` (comments.ts): same
   matched/unanchored split, keyed the same way (`lineKey`/`keysForLine`).

   An annotation can span a *range* of lines (D9's start_line..end_line): it
   carries an ordered `keys` list rather than one key. `partitionAnnotations`
   paints the marker on every key of that range that is actually rendered in
   this diff, but keeps the caller's `node` on only the LAST rendered key —
   so a multi-line finding gets one card, positioned GitHub-style after the
   last line it covers, not one card per line. A range with no rendered key
   at all is unanchored exactly once, same as a single-key annotation. */
import type { ReactNode } from "react";
import type { IconName } from "@devdigest/ui";

/** Visual treatment for the line a LineAnnotation is keyed to (D9). `bg` is
    the pill's background (SEV[sev].bg); when omitted the pill falls back to a
    tinted mix of `color`. */
export interface LineMarker {
  color: string;
  bg?: string;
  label: string;
  icon: IconName;
}

/** One arbitrary annotation anchored to a rendered line range by key. */
export interface LineAnnotation {
  id: string;
  /** Ordered `lineKey('RIGHT' | 'LEFT', n)` values the annotation spans — a
      single-line annotation is a one-element array. */
  keys: string[];
  marker: LineMarker | null;
  node: ReactNode;
}

/**
 * Split annotations into those keyed to a rendered line (matched) and those
 * with no rendered key at all (unanchored). Mirrors `partitionThreads` so
 * nothing is silently dropped. For a matched annotation, every rendered key
 * in its range gets a copy carrying the marker; only the last rendered key's
 * copy keeps the `node`, so a range's card renders once, after the range's
 * last rendered line.
 */
export function partitionAnnotations(
  items: LineAnnotation[],
  renderedKeys: Set<string>,
): { matched: Map<string, LineAnnotation[]>; unanchored: LineAnnotation[] } {
  const matched = new Map<string, LineAnnotation[]>();
  const unanchored: LineAnnotation[] = [];
  for (const a of items) {
    const rendered = a.keys.filter((k) => renderedKeys.has(k));
    if (rendered.length === 0) {
      unanchored.push(a);
      continue;
    }
    const lastKey = rendered[rendered.length - 1]!;
    for (const key of rendered) {
      const list = matched.get(key) ?? [];
      list.push(key === lastKey ? a : { ...a, node: null });
      matched.set(key, list);
    }
  }
  return { matched, unanchored };
}
