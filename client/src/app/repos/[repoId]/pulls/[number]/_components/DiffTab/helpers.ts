/* DiffTab/helpers.ts — pure Smart Diff view functions (spec 08 §7 step 6). */
import type { ReactNode } from "react";
import { SmartDiffRole, type SmartDiffResponse, type FindingRecord, type ReviewRecord } from "@devdigest/shared";
import { SEV } from "@devdigest/ui";
import { lineKey, type LineAnnotation, type LineMarker } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import { SEVERITY_RANK } from "./constants";

export interface ViewGroupFile {
  file: PrFile;
  findingLines: number[];
}

export interface ViewGroup {
  role: SmartDiffRole;
  files: ViewGroupFile[];
}

/**
 * Joins `pr.files` with the `/smart-diff` response by path (D5): groups
 * follow `SmartDiffRole.options` order, files inside a group keep
 * `pr.files`'s own relative order (not `sd`'s), a path `sd` doesn't classify
 * lands in "core" with no finding lines and is never dropped, and a role
 * `sd` lists with `files: []` produces no group (D3 — the route always
 * returns all five, the client hides the empty ones).
 */
export function getViewGroups(files: PrFile[], sd: SmartDiffResponse): ViewGroup[] {
  const byPath = new Map<string, { role: SmartDiffRole; findingLines: number[] }>();
  for (const group of sd.groups) {
    for (const f of group.files) {
      byPath.set(f.path, { role: group.role, findingLines: f.finding_lines });
    }
  }

  const groups: ViewGroup[] = [];
  for (const role of SmartDiffRole.options) {
    const roleFiles = files
      .filter((f) => (byPath.get(f.path)?.role ?? "core") === role)
      .map((f) => ({ file: f, findingLines: byPath.get(f.path)?.findingLines ?? [] }));
    if (roleFiles.length > 0) groups.push({ role, files: roleFiles });
  }
  return groups;
}

/**
 * The marker for the findings anchored to one line (D9): the highest-severity
 * *undismissed* finding wins, translated through `t`; null when every finding
 * given is dismissed, or the list is empty. Dismissed findings still render
 * their (muted) card — `getFindingAnnotations` keeps them — they just don't
 * set the bar/pill.
 */
export function getMarker(findings: FindingRecord[], t: (key: string) => string): LineMarker | null {
  const active = findings.filter((f) => !f.dismissed_at);
  if (active.length === 0) return null;
  const top = active.reduce((best, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[best.severity] ? f : best));
  const sev = SEV[top.severity];
  return {
    color: sev.c,
    bg: sev.bg,
    icon: sev.icon,
    label: t(`smartDiff.marker.${top.severity.toLowerCase()}`),
  };
}

/**
 * One `LineAnnotation` per finding of the latest review, grouped by file and
 * spanning its own `start_line..end_line` (D4, D9, Fix 1): the marker paints
 * on every rendered line of that range, and the finding's card sits once,
 * after the range's last rendered line (`partitionAnnotations`, diff-viewer).
 * Findings that share an exact `start_line` still share one marker — the
 * highest-severity undismissed one, via `getMarker` — same as before ranges
 * existed, so several findings overlapping the same line keep one precedence
 * rule. `render` turns a finding into the caller's `FindingCard` element.
 */
export function getFindingAnnotations(
  review: ReviewRecord | null,
  t: (key: string) => string,
  render: (f: FindingRecord) => ReactNode,
): Map<string, LineAnnotation[]> {
  const byPath = new Map<string, LineAnnotation[]>();
  if (!review) return byPath;

  const byFileLine = new Map<string, FindingRecord[]>();
  for (const f of review.findings) {
    const key = `${f.file}\u0000${f.start_line}`;
    const list = byFileLine.get(key) ?? [];
    list.push(f);
    byFileLine.set(key, list);
  }

  for (const [key, lineFindings] of byFileLine) {
    const sep = key.indexOf("\u0000");
    const file = key.slice(0, sep);
    const marker = getMarker(lineFindings, t);
    const anns = byPath.get(file) ?? [];
    for (const f of lineFindings) {
      const keys: string[] = [];
      for (let line = f.start_line; line <= f.end_line; line++) {
        const k = lineKey("RIGHT", line);
        if (k) keys.push(k);
      }
      anns.push({ id: f.id, keys, marker, node: render(f) });
    }
    byPath.set(file, anns);
  }
  return byPath;
}

/**
 * "Original order" (A14, Fix 2): the flat view sorts every file by path
 * (`path.localeCompare`), matching the design's `SmartDiff` flat branch —
 * not `pr.files`'s own (GitHub) order, which Smart order already keys off.
 */
export function sortFilesByPath(files: PrFile[]): PrFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}
