import { SmartDiffRole, type SmartDiffFile, type SmartDiffResponse } from '@devdigest/shared';
import type { LatestReviewFindings } from './repository.js';

/**
 * smart-diff module — the pure half (D3/D4/D14, §5). `classify` is injected
 * (reviewer-core's `classifyFile` in production) so this stays independent of
 * the rule table; the unit test (T2) pins its own stand-in.
 */

/** Only `path`/`additions`/`deletions` matter here — any row shape (e.g. a
 *  `PrFileRow`) that carries at least these fields satisfies this. */
export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

/** D3 (five roles, fixed display order, empty groups carry `files: []`),
 *  D4 (findings come from the latest review, undismissed, sorted +
 *  deduplicated per file) and D14 (minimal `split_suggestion`). Within a
 *  group, files keep the order they arrived in (`pr_files` order). */
export function buildSmartDiff(
  files: SmartDiffSourceFile[],
  latest: LatestReviewFindings,
  classify: (path: string) => SmartDiffRole,
): SmartDiffResponse {
  const findingLinesByPath = new Map<string, Set<number>>();
  for (const finding of latest.findings) {
    if (finding.dismissed) continue;
    const lines = findingLinesByPath.get(finding.file) ?? new Set<number>();
    lines.add(finding.startLine);
    findingLinesByPath.set(finding.file, lines);
  }

  const filesByRole = new Map<SmartDiffRole, SmartDiffFile[]>(
    SmartDiffRole.options.map((role) => [role, []]),
  );
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const lines = [...(findingLinesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    filesByRole.get(classify(file.path))!.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines,
    });
  }

  return {
    groups: SmartDiffRole.options.map((role) => ({ role, files: filesByRole.get(role)! })),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
    review_id: latest.reviewId,
  };
}
