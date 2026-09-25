import type {
  BlastDegradedReason,
  BlastRadiusResponse,
  BlastStats,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';

/**
 * blast module — the pure half (D4/D5, §5). No I/O: `service.ts` calls these
 * with the facade's `BlastResult` + `IndexState` already in hand. Types come
 * from `../repo-intel/types.js` (the port) and `@devdigest/shared`.
 */

// ---------------------------------------------------------------------------
// D4 — status
// ---------------------------------------------------------------------------

export interface BlastStatusInput {
  changedFileCount: number;
  flagOn: boolean;
  /** `null` when the facade was never called (0 changed files). */
  result: BlastResult | null;
  /** `null` when the facade was never called (0 changed files). */
  indexState: IndexState | null;
}

export interface BlastStatusResult {
  status: BlastRadiusResponse['status'];
  reason: BlastDegradedReason | null;
}

/**
 * Derive the route's `status`/`degraded_reason` (D4). The first match wins:
 * 0 changed files → the facade is never called, so this always runs first
 * with `result`/`indexState` both `null`.
 */
export function deriveBlastStatus(input: BlastStatusInput): BlastStatusResult {
  if (input.changedFileCount === 0) return { status: 'degraded', reason: 'no_changed_files' };
  if (!input.flagOn) return { status: 'degraded', reason: 'flag_off' };

  const { result, indexState } = input;
  if (result?.degraded) {
    const reason: BlastDegradedReason =
      indexState?.status === 'failed'
        ? 'index_failed'
        : (indexState?.degradedReason ?? result.reason ?? 'no_data');
    return { status: 'degraded', reason };
  }
  if (indexState?.status === 'partial') return { status: 'degraded', reason: 'index_partial' };
  return { status: 'ok', reason: null };
}

// ---------------------------------------------------------------------------
// D5 — mapping
// ---------------------------------------------------------------------------

/**
 * Map a facade `BlastResult` to the route's full response shape (D5). Pure —
 * every field is computed from `result`, the already-derived `status`, and
 * `indexSha` (D7 — the caller line numbers come from the indexed commit, not
 * HEAD). `service.ts` returns this as-is on both the empty and facade paths.
 */
export function toBlastRadius(
  result: BlastResult,
  status: BlastStatusResult,
  indexSha: string | null,
): BlastRadiusResponse {
  const changed_symbols: ChangedSymbol[] = [...result.changedSymbols]
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
    .map((s) => ({ name: s.name, file: s.file, kind: s.kind }));

  // Group callers by viaSymbol, keeping facade order within each group.
  const byViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    const group = byViaSymbol.get(c.viaSymbol);
    if (group) group.push(c);
    else byViaSymbol.set(c.viaSymbol, [c]);
  }

  const downstream: DownstreamImpact[] = [];
  for (const [symbol, callers] of byViaSymbol) {
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of new Set(callers.map((c) => c.file))) {
      const facts = result.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    downstream.push({
      symbol,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints].sort(),
      crons_affected: [...crons].sort(),
    });
  }
  downstream.sort((a, b) => b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol));

  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  let callerCount = 0;
  for (const group of downstream) {
    callerCount += group.callers.length;
    for (const e of group.endpoints_affected) allEndpoints.add(e);
    for (const c of group.crons_affected) allCrons.add(c);
  }

  const stats: BlastStats = {
    symbols: changed_symbols.length,
    callers: callerCount,
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  };

  return {
    changed_symbols,
    downstream,
    summary: formatBlastSummary(status, stats),
    stats,
    truncated: result.truncated ?? false,
    status: status.status,
    degraded_reason: status.reason,
    index_sha: indexSha,
  };
}

/** `n word` / `n words` — every stat pluralises the same way. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Deterministic English summary (D5) — the MCP tool relays this verbatim, so
 * it never depends on i18n or locale.
 */
export function formatBlastSummary(status: BlastStatusResult, stats: BlastStats): string {
  if (stats.callers > 0) {
    return (
      `${plural(stats.symbols, 'symbol')} changed → ` +
      `${plural(stats.callers, 'caller')}, ${plural(stats.endpoints, 'endpoint')}, ${plural(stats.crons, 'cron')}`
    );
  }
  if (status.status === 'ok') {
    return `${plural(stats.symbols, 'symbol')} changed, no downstream callers found.`;
  }
  return `Blast radius unavailable: ${status.reason}.`;
}
