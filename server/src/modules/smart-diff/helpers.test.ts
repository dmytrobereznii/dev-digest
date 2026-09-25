import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from './helpers.js';
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * T2 — the smart-diff module's pure half (D3/D4/D14/§5). `classify` is
 * injected so this test is independent of reviewer-core's rule table (D2's
 * boilerplate/tests/wiring/docs patterns) — the stand-in below only needs to
 * be internally consistent with the fixture paths used here.
 */

const ROLE_BY_PATH: Record<string, SmartDiffRole> = {
  'src/api/payouts/retry.ts': 'core',
  'src/lib/retry-window.ts': 'core',
  'test/lib/retry-window.test.ts': 'tests',
  'src/lib/index.ts': 'wiring',
  'package.json': 'wiring',
  'docs/retry-window.md': 'docs',
  'pnpm-lock.yaml': 'boilerplate',
};
const classify = (path: string): SmartDiffRole => ROLE_BY_PATH[path] ?? 'core';

/** Only `path`/`additions`/`deletions` matter to this pure function — the
 *  repository's row shape (id, prId, patch, …) is irrelevant here. */
function file(path: string, additions: number, deletions: number) {
  return { path, additions, deletions };
}

describe('buildSmartDiff', () => {
  it('returns all five roles in the fixed display order, with unmatched roles carrying files: []', () => {
    const files = [file('src/lib/retry-window.ts', 40, 0), file('package.json', 1, 0)];
    const latest = { reviewId: null, findings: [] };

    const result = buildSmartDiff(files, latest, classify);

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byRole = new Map(result.groups.map((g) => [g.role, g.files]));
    expect(byRole.get('tests')).toEqual([]);
    expect(byRole.get('docs')).toEqual([]);
    expect(byRole.get('boilerplate')).toEqual([]);
  });

  it('keeps pr_files order within a group', () => {
    const files = [
      file('src/lib/retry-window.ts', 40, 0),
      file('docs/retry-window.md', 12, 0),
      file('src/api/payouts/retry.ts', 8, 2),
    ];
    const latest = { reviewId: null, findings: [] };

    const result = buildSmartDiff(files, latest, classify);

    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/lib/retry-window.ts', 'src/api/payouts/retry.ts']);
  });

  it('collects undismissed finding_lines for the matching file only, sorted and deduplicated', () => {
    const files = [file('src/lib/retry-window.ts', 40, 0), file('src/api/payouts/retry.ts', 8, 2)];
    const latest = {
      reviewId: 'review-1',
      findings: [
        { file: 'src/lib/retry-window.ts', startLine: 30, dismissed: false },
        { file: 'src/lib/retry-window.ts', startLine: 12, dismissed: false },
        { file: 'src/lib/retry-window.ts', startLine: 12, dismissed: false }, // duplicate line
        { file: 'src/lib/retry-window.ts', startLine: 99, dismissed: true }, // dismissed — excluded
        { file: 'src/api/payouts/retry.ts', startLine: 5, dismissed: false }, // a different file — ignored here
      ],
    };

    const result = buildSmartDiff(files, latest, classify);

    const core = result.groups.find((g) => g.role === 'core')!;
    const retryWindow = core.files.find((f) => f.path === 'src/lib/retry-window.ts')!;
    expect(retryWindow.finding_lines).toEqual([12, 30]);
  });

  it('sums additions+deletions across every file into total_lines, with no split proposed (D14)', () => {
    const files = [file('src/lib/retry-window.ts', 40, 3), file('pnpm-lock.yaml', 5, 5)];
    const latest = { reviewId: null, findings: [] };

    const result = buildSmartDiff(files, latest, classify);

    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 53, proposed_splits: [] });
  });

  it('no review: review_id is null and every file has an empty finding_lines', () => {
    const files = [file('src/lib/retry-window.ts', 40, 0), file('pnpm-lock.yaml', 5, 5)];
    const latest = { reviewId: null, findings: [] };

    const result = buildSmartDiff(files, latest, classify);

    expect(result.review_id).toBeNull();
    const allFindingLines = result.groups.flatMap((g) => g.files.flatMap((f) => f.finding_lines));
    expect(allFindingLines).toEqual([]);
  });
});
