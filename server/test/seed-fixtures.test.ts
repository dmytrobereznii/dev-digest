import { describe, it, expect } from 'vitest';
import { DEMO_PRS, type DemoPr } from '../src/db/seed-prs/index.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

/**
 * Invariants over the demo PR fixtures (`src/db/seed-prs/`).
 *
 * A fixture's `patch` is a STRING. Nothing type-checks its contents, and
 * `parseUnifiedDiff` trusts the `@@ -a,b +c,d @@` header rather than
 * validating it — so a header whose numbers disagree with the body produces
 * wrong hunk ranges in silence. The visible symptom is a seeded finding that
 * fails to anchor in the diff viewer, which no other suite would catch: the
 * unit lane, `tsc`, `eslint` and `depcruise` all stay green.
 *
 * That hazard was documented twice before this file existed (the doc comment
 * on `seed-prs/types.ts` and an entry in `.context/insights/INSIGHTS.md`) and
 * was still miscounted on the next fixture written. This is the same check as
 * an assertion, so it costs nothing to remember.
 *
 * Hermetic: imports the fixtures as data, touches no DB.
 */

interface HunkCount {
  header: string;
  declaredOld: number;
  declaredNew: number;
  actualOld: number;
  actualNew: number;
}

interface PatchTally {
  additions: number;
  deletions: number;
  hunks: HunkCount[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Recompute a patch from its body: `newLines` = context + `+` lines,
 * `oldLines` = context + `-` lines. Deliberately independent of
 * `parseUnifiedDiff` — a parser cannot be its own oracle.
 */
function tally(patch: string): PatchTally {
  const hunks: HunkCount[] = [];
  let additions = 0;
  let deletions = 0;
  let open: { header: string; old: number; new: number } | null = null;
  let ctx = 0;
  let add = 0;
  let del = 0;

  const close = () => {
    if (!open) return;
    hunks.push({
      header: open.header,
      declaredOld: open.old,
      declaredNew: open.new,
      actualOld: ctx + del,
      actualNew: ctx + add,
    });
    additions += add;
    deletions += del;
  };

  for (const line of patch.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (m) {
      close();
      open = {
        header: line.slice(0, line.indexOf('@@', 2) + 2),
        old: m[2] === undefined ? 1 : Number(m[2]),
        new: m[4] === undefined ? 1 : Number(m[4]),
      };
      ctx = add = del = 0;
      continue;
    }
    if (!open) continue;
    if (line.startsWith('+')) add++;
    else if (line.startsWith('-')) del++;
    else ctx++;
  }
  close();
  return { additions, deletions, hunks };
}

/** Mirrors `modules/reviews/diff-loader.ts` → `diffFromPrFiles`. */
function reconstruct(fx: DemoPr): string {
  const parts: string[] = [];
  for (const f of fx.files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parts.join('\n');
}

describe.each(DEMO_PRS.map((fx) => [fx.number, fx] as const))('demo PR #%i', (_number, fx) => {
  const patched = fx.files.filter((f) => f.patch);

  it('declares a hunk header that matches its body', () => {
    for (const f of patched) {
      for (const h of tally(f.patch!).hunks) {
        expect(
          { file: f.path, header: h.header, old: h.actualOld, new: h.actualNew },
          `${f.path} ${h.header}`,
        ).toEqual({
          file: f.path,
          header: h.header,
          old: h.declaredOld,
          new: h.declaredNew,
        });
      }
    }
  });

  it('declares per-file additions/deletions that match its body', () => {
    for (const f of patched) {
      const counted = tally(f.patch!);
      expect({ path: f.path, additions: f.additions, deletions: f.deletions }).toEqual({
        path: f.path,
        additions: counted.additions,
        deletions: counted.deletions,
      });
    }
  });

  it('totals its files — `filesCount` and additions/deletions cover the null-patch ones too', () => {
    expect(fx.filesCount).toBe(fx.files.length);
    expect({
      additions: fx.additions,
      deletions: fx.deletions,
    }).toEqual({
      additions: fx.files.reduce((n, f) => n + f.additions, 0),
      deletions: fx.files.reduce((n, f) => n + f.deletions, 0),
    });
  });

  it('survives the reviewer’s own reconstruction', () => {
    const parsed = parseUnifiedDiff(reconstruct(fx));
    expect(parsed.files.map((f) => f.path).sort()).toEqual(patched.map((f) => f.path).sort());
  });

  it('anchors every seeded finding inside a real hunk', () => {
    if (!fx.review) return;
    const parsed = parseUnifiedDiff(reconstruct(fx));
    for (const finding of fx.review.findings) {
      if (finding.kind && finding.kind !== 'finding') continue; // full-file kinds ground on the file
      const file = parsed.files.find((f) => f.path === finding.file);
      expect(file, `${finding.title}: cites ${finding.file}, which has no patch`).toBeDefined();
      const hit = file!.hunks.some(
        (h) => finding.startLine <= h.newStart + h.newLines - 1 && finding.endLine >= h.newStart,
      );
      const ranges = file!.hunks.map((h) => `${h.newStart}-${h.newStart + h.newLines - 1}`);
      expect(
        hit,
        `${finding.title}: ${finding.file}:${finding.startLine}-${finding.endLine} is outside every hunk (${ranges.join(', ')})`,
      ).toBe(true);
    }
  });
});
