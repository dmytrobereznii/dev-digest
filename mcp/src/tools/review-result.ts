/**
 * The shared `ReviewResult` builder (§6.1) — the ONLY place that turns an
 * `ApiReview` + run info into the tool output shape `run_agent_on_pr` and
 * `get_findings` both return. Neither tool file imports the other; both
 * import this one, plus `selectReview` (the one review-selection rule) and
 * `runFailureToolError` (the E12/E13/E14 mapping for a `failed`/`cancelled`
 * run) — the other piece both tools need once they have resolved a run.
 */
import type { ApiFinding, ApiReview } from '../api/schemas.js';
import { ToolError } from '../errors.js';
import * as messages from '../messages.js';
import { redactSecrets } from '../redact.js';
import { sanitizeUntrusted } from '../sanitize.js';
import {
  AGENT_NAME_MAX,
  CONCISE_MAX_FINDINGS,
  CONCISE_RATIONALE_MAX,
  CATEGORY_MAX,
  FILE_MAX,
  FULL_MAX_FINDINGS,
  FULL_RATIONALE_MAX,
  RELAYED_ERROR_MAX,
  REPO_FULL_NAME_MAX,
  SEVERITY_ORDER,
  SUGGESTION_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  type Severity,
} from './constants.js';
import type { ReviewResultOutput } from './schemas.js';

/** D13: a relayed API/run error is redacted FIRST, then sanitized, then cut
 * to 500 chars — in that order, so a token straddling the cut is masked
 * before it can be sliced in half. */
export function sanitizeRelayedError(text: string): string {
  return sanitizeUntrusted(redactSecrets(text), RELAYED_ERROR_MAX);
}

/** §6.1 review selection, the one rule both tools use: the first
 * `ReviewRecord` with `run_id === id && kind === 'review'`; never an older
 * run. None found → E18 (the run finished but its review row was deleted). */
export function selectReview(reviews: ApiReview[], runId: string): ApiReview {
  const found = reviews.find((r) => r.run_id === runId && r.kind === 'review');
  if (!found) {
    throw new ToolError(messages.e18(runId));
  }
  return found;
}

/** A regex over the raw (unredacted) run error — the key NAME is not a
 * secret, so this reads the original text, before `sanitizeRelayedError`
 * would mask anything shaped like a token in it. */
const MISSING_KEY_PATTERN = /([A-Z_]+_API_KEY) is not configured/;

/** The E12/E13/E14 mapping for a `failed` or `cancelled` run — a `ToolError`
 * ready to throw, whose message a tool's outer catch relays verbatim. */
export function runFailureToolError(
  run: { run_id: string; status: string | null; error: string | null },
  webUrl: string,
): ToolError {
  if (run.status === 'cancelled') {
    return new ToolError(messages.e14(run.run_id));
  }
  const keyMatch = run.error?.match(MISSING_KEY_PATTERN);
  if (keyMatch) {
    return new ToolError(messages.e12(run.run_id, keyMatch[1]!, webUrl));
  }
  const relayed = run.error != null ? sanitizeRelayedError(run.error) : null;
  return new ToolError(messages.e13(run.run_id, relayed));
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Defence in depth (D13 didn't originally list these): a repo's `full_name`
 * and a run's `agent_name` both come from the API, echoed straight into
 * output — cap and strip them like any other untrusted text. Exported so a
 * tool that hand-builds its own `next_step` text (not routed through
 * `messages.ts`, which sanitizes on its own) can sanitize at the call site
 * too, per D13. */
export function sanitizeRepoName(repo: string): string {
  return sanitizeUntrusted(repo, REPO_FULL_NAME_MAX, { singleLine: true });
}

function sanitizeAgentName(name: string | null): string | null {
  return name != null ? sanitizeUntrusted(name, AGENT_NAME_MAX, { singleLine: true }) : null;
}

function formatLocation(file: string, startLine: number, endLine: number): string {
  const cleanFile = sanitizeUntrusted(file, FILE_MAX, { singleLine: true });
  return startLine === endLine ? `${cleanFile}:${startLine}` : `${cleanFile}:${startLine}-${endLine}`;
}

function severityIndex(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function sortFindings(findings: ApiFinding[]): ApiFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityIndex(a.severity) - severityIndex(b.severity);
    if (bySeverity !== 0) return bySeverity;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return a.start_line - b.start_line;
  });
}

export interface ReviewResultInput {
  repo: string;
  repoId: string;
  prNumber: number;
  prTitle: string;
  runId: string;
  agentName: string | null;
  review: ApiReview;
  detail: 'concise' | 'full';
  minSeverity?: Severity;
  attachedToExistingRun?: boolean;
  webUrl: string;
}

/** Everything `buildReviewResult` computed beyond the output shape itself —
 * `shown`/`scopedTotal` let a caller build a "Showing k of N" `next_step`
 * without re-deriving the same sort/filter/cap logic. */
export interface ReviewResultBuild {
  result: ReviewResultOutput;
  shown: number;
  scopedTotal: number;
}

/** §6.1: sort, drop dismissed (counted separately), cap, sanitize every
 * untrusted field, and shape the `done` `ReviewResult`. */
export function buildReviewResult(input: ReviewResultInput): ReviewResultBuild {
  const nonDismissed = input.review.findings.filter((f) => f.dismissed_at == null);
  const dismissedCount = input.review.findings.length - nonDismissed.length;

  const counts: ReviewResultOutput['counts'] = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of nonDismissed) counts[f.severity]++;

  const minIndex = input.minSeverity ? severityIndex(input.minSeverity) : SEVERITY_ORDER.length - 1;
  const scoped = nonDismissed.filter((f) => severityIndex(f.severity) <= minIndex);
  const sorted = sortFindings(scoped);

  const cap = input.detail === 'full' ? FULL_MAX_FINDINGS : CONCISE_MAX_FINDINGS;
  const rationaleMax = input.detail === 'full' ? FULL_RATIONALE_MAX : CONCISE_RATIONALE_MAX;
  const capped = sorted.slice(0, cap);
  const truncated = sorted.length > cap;

  const findings: ReviewResultOutput['findings'] = capped.map((f) => {
    const finding: ReviewResultOutput['findings'][number] = {
      severity: f.severity,
      title: sanitizeUntrusted(f.title, TITLE_MAX, { singleLine: true }),
      location: formatLocation(f.file, f.start_line, f.end_line),
      category: sanitizeUntrusted(f.category, CATEGORY_MAX, { singleLine: true }),
      confidence: roundConfidence(f.confidence),
      rationale: sanitizeUntrusted(f.rationale, rationaleMax),
    };
    if (input.detail === 'full') {
      finding.suggestion = f.suggestion != null ? sanitizeUntrusted(f.suggestion, SUGGESTION_MAX) : null;
    }
    return finding;
  });

  const result: ReviewResultOutput = {
    status: 'done',
    repo: sanitizeRepoName(input.repo),
    pr_number: input.prNumber,
    pr_title: sanitizeUntrusted(input.prTitle, TITLE_MAX, { singleLine: true }),
    agent: sanitizeAgentName(input.agentName),
    run_id: input.runId,
    verdict: input.review.verdict,
    score: input.review.score,
    summary: input.review.summary != null ? sanitizeUntrusted(input.review.summary, SUMMARY_MAX) : null,
    counts,
    findings,
    truncated,
    cost_usd: input.review.cost_usd,
    web_url: `${input.webUrl}/repos/${input.repoId}/pulls/${input.prNumber}`,
  };
  if (input.attachedToExistingRun) result.attached_to_existing_run = true;
  if (dismissedCount > 0) result.dismissed = dismissedCount;

  return { result, shown: capped.length, scopedTotal: sorted.length };
}

export interface RunningResultInput {
  repo: string;
  repoId: string;
  prNumber: number;
  prTitle: string;
  agentName: string | null;
  runId: string;
  webUrl: string;
  attachedToExistingRun?: boolean;
}

/** A `running` result: `verdict: null`, zeroed counts, empty findings (§6.1). */
export function buildRunningResult(input: RunningResultInput): ReviewResultOutput {
  const result: ReviewResultOutput = {
    status: 'running',
    repo: sanitizeRepoName(input.repo),
    pr_number: input.prNumber,
    pr_title: sanitizeUntrusted(input.prTitle, TITLE_MAX, { singleLine: true }),
    agent: sanitizeAgentName(input.agentName),
    run_id: input.runId,
    verdict: null,
    score: null,
    summary: null,
    counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    findings: [],
    truncated: false,
    cost_usd: null,
    web_url: `${input.webUrl}/repos/${input.repoId}/pulls/${input.prNumber}`,
  };
  if (input.attachedToExistingRun) result.attached_to_existing_run = true;
  return result;
}
