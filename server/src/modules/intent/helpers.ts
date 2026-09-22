import { createHash } from 'node:crypto';
import type { IntentConfidence, IntentSignal, IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { IntentRow } from './repository.js';

/**
 * Pure helpers (D2/D6/§5.2): the freshness key, the "PR's own added file"
 * reconstruction, and the row → API-record mapping. No I/O — testable without
 * a DB or a clone (T5).
 */

/** sha256("title\nbody") — the text half of the freshness key (D2). */
export function prTextHash(title: string, body: string | null | undefined): string {
  return createHash('sha256').update(`${title}\n${body ?? ''}`).digest('hex');
}

/** A row is stale when either half of the freshness key no longer matches the
 *  PR it was derived against (D2). Linked-document changes are NOT part of
 *  this check — only the force button covers those. */
export function isStale(
  row: { headSha: string | null; prTextHash: string | null },
  pull: { headSha: string; title: string; body: string | null | undefined },
): boolean {
  return row.headSha !== pull.headSha || row.prTextHash !== prTextHash(pull.title, pull.body);
}

const ADDED_HUNK_RE = /^@@ -0,0 \+\d+(?:,\d+)? @@/;

/**
 * D6 step 2 — the PR's OWN copy of a file it adds, rebuilt from a pure-addition
 * patch's `+` lines (`pr_files.patch` is hunks-only, no `diff --git`/`---`/`+++`
 * headers — see `seed-diffs.ts`). Returns `null` when the patch is missing or
 * isn't a single pure-addition hunk (a modified/deleted file falls through to
 * the clone instead).
 */
export function contentFromAddedPatch(patch: string | null | undefined): string | null {
  if (!patch) return null;
  const lines = patch.split('\n');
  const headers = lines.filter((l) => l.startsWith('@@'));
  if (headers.length !== 1 || !ADDED_HUNK_RE.test(headers[0]!)) return null;
  const added: string[] = [];
  for (const line of lines) {
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+')) added.push(line.slice(1));
    else if (line.trim() === '') continue;
    else return null; // a '-' or context line means this isn't a pure addition
  }
  return added.join('\n');
}

/** `IntentRow` (persistence) → `PrIntentRecord` (API), with `stale` computed
 *  live against the CURRENT pull row (never cached — D2). */
export function toRecord(
  row: IntentRow,
  pull: { headSha: string; title: string; body: string | null | undefined },
): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    pr_id: row.prId,
    confidence: row.confidence as IntentConfidence,
    signals: row.signals as IntentSignal[],
    sources: row.sources as unknown as IntentSource[],
    model: row.model,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    head_sha: row.headSha,
    derived_at: row.derivedAt.toISOString(),
    stale: isStale(row, pull),
  };
}
