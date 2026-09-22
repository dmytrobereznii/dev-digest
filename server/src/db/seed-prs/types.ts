/**
 * Declarative shape of a demo pull request.
 *
 * One fixture per file under this directory; `index.ts` collects them and
 * `helpers.ts` writes them. Everything the seeder needs is data — there is no
 * per-PR seeding code, so adding a demo PR is a one-file change.
 *
 * Two fields decide what the PR list shows and are easy to get wrong:
 *
 * - `ghStatus` is GitHub's MERGE state (`open` / `merged` / `closed`), not the
 *   review status. `deriveReviewStatus` (modules/pulls/status.ts) turns an
 *   `open` PR into `needs_review` / `reviewed` / `stale` from `lastReviewedSha`
 *   vs `headSha` plus `updatedDaysAgo` against `STALE_DAYS` (7).
 * - `patch: null` on a file is a REAL state (GitHub omits patches for large or
 *   binary files) and the reviewer SKIPS those rows when it reconstructs the
 *   diff — the demo repo is never cloned, so that reconstruction is the only
 *   source. A fixture whose files are all null-patch reviews an empty diff.
 *
 * Dates are relative (`*DaysAgo`) and re-applied on every seed run, so a
 * `reviewed` fixture does not quietly rot into `stale` as the DB ages.
 */

export interface DemoPrFile {
  path: string;
  additions: number;
  deletions: number;
  /** Unified-diff hunks only — no `diff --git` / `---` / `+++` headers. */
  patch: string | null;
}

export interface DemoPrCommit {
  sha: string;
  message: string;
  author: string;
}

/**
 * A seeded finding. `startLine`/`endLine` are NEW-side line numbers and should
 * fall inside one of the file's hunks (`newStart … newStart + newLines - 1`),
 * or the diff viewer has nothing to anchor to — the same rule the grounding
 * gate applies to findings a real run produces.
 */
export interface DemoPrFinding {
  file: string;
  startLine: number;
  endLine: number;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: 'bug' | 'security' | 'perf' | 'style' | 'test';
  title: string;
  rationale: string;
  suggestion?: string;
  confidence: number;
  /** Full-file kinds (`secret_leak`, …) ground on the file, not on a hunk. */
  kind?: 'finding' | 'secret_leak' | 'lethal_trifecta' | 'phantom' | 'hook';
}

export interface DemoPrRun {
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** null = the model had no known price, so the Cost column reads "—". */
  costUsd: number | null;
  grounding: string;
  blockers: number;
}

export interface DemoPrReview {
  /** Which built-in agent the run is attributed to, by name. */
  agent: 'General Reviewer' | 'Security Reviewer' | 'Performance Reviewer';
  verdict: 'request_changes' | 'approve' | 'comment';
  summary: string;
  /** 0-100, higher is better. 90+ approve · 60-89 minor · 30-59 warnings · <30 critical. */
  score: number;
  findings: DemoPrFinding[];
  run: DemoPrRun;
}

export interface DemoPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  /** Totals across ALL changed files, including the null-patch ones. */
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state — see the note above. */
  ghStatus: 'open' | 'merged' | 'closed';
  body: string;
  /** Equal to `headSha` ⇒ reviewed/stale; null ⇒ needs_review. */
  lastReviewedSha: string | null;
  openedDaysAgo: number;
  updatedDaysAgo: number;
  files: DemoPrFile[];
  commits: DemoPrCommit[];
  /** null ⇒ never reviewed: no score, no findings, no cost. */
  review: DemoPrReview | null;
}
