import { describe, it, expect } from 'vitest';
import { deriveBlastStatus, formatBlastSummary, toBlastRadius } from './helpers.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';

/**
 * T3 — the blast module's pure half (D4/D5, §5). No I/O: every case builds
 * `BlastResult`/`IndexState` fixtures directly, the same shapes `service.ts`
 * hands these functions in production.
 */

function indexState(over: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'sha1',
    indexerVersion: 2,
    updatedAt: new Date(0),
    ...over,
  };
}

describe('deriveBlastStatus (D4) — each branch, in order', () => {
  it('1. 0 changed files → degraded, no_changed_files (result/indexState null)', () => {
    expect(deriveBlastStatus({ changedFileCount: 0, flagOn: true, result: null, indexState: null })).toEqual({
      status: 'degraded',
      reason: 'no_changed_files',
    });
  });

  it('2. flag off → degraded, flag_off (even with a full index)', () => {
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    expect(
      deriveBlastStatus({ changedFileCount: 1, flagOn: false, result, indexState: indexState() }),
    ).toEqual({ status: 'degraded', reason: 'flag_off' });
  });

  it('3a. result.degraded + indexState.status failed → index_failed (overrides result.reason)', () => {
    const result: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    expect(
      deriveBlastStatus({
        changedFileCount: 1,
        flagOn: true,
        result,
        indexState: indexState({ status: 'failed' }),
      }),
    ).toEqual({ status: 'degraded', reason: 'index_failed' });
  });

  it('3b. result.degraded, not failed → indexState.degradedReason wins over result.reason', () => {
    const result: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    expect(
      deriveBlastStatus({
        changedFileCount: 1,
        flagOn: true,
        result,
        indexState: indexState({ status: 'degraded', degradedReason: 'repo_too_large' }),
      }),
    ).toEqual({ status: 'degraded', reason: 'repo_too_large' });
  });

  it("3c. result.degraded, no indexState.degradedReason → falls back to result.reason, then 'no_data'", () => {
    const result: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'repo_too_large',
    };
    expect(
      deriveBlastStatus({ changedFileCount: 1, flagOn: true, result, indexState: indexState() }),
    ).toEqual({ status: 'degraded', reason: 'repo_too_large' });

    const bare: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true };
    expect(
      deriveBlastStatus({ changedFileCount: 1, flagOn: true, result: bare, indexState: indexState() }),
    ).toEqual({ status: 'degraded', reason: 'no_data' });
  });

  it('4. index partial, result not degraded → degraded, index_partial', () => {
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    expect(
      deriveBlastStatus({
        changedFileCount: 1,
        flagOn: true,
        result,
        indexState: indexState({ status: 'partial' }),
      }),
    ).toEqual({ status: 'degraded', reason: 'index_partial' });
  });

  it('5. otherwise → ok, null', () => {
    const result: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    expect(
      deriveBlastStatus({ changedFileCount: 1, flagOn: true, result, indexState: indexState() }),
    ).toEqual({ status: 'ok', reason: null });
  });
});

describe('formatBlastSummary (D5) — the 3 forms, pluralised', () => {
  it('with callers: full sentence, each count pluralised independently', () => {
    expect(
      formatBlastSummary({ status: 'ok', reason: null }, { symbols: 2, callers: 14, endpoints: 3, crons: 1 }),
    ).toBe('2 symbols changed → 14 callers, 3 endpoints, 1 cron');
  });

  it('with exactly 1 of everything: all singular', () => {
    expect(
      formatBlastSummary({ status: 'ok', reason: null }, { symbols: 1, callers: 1, endpoints: 1, crons: 1 }),
    ).toBe('1 symbol changed → 1 caller, 1 endpoint, 1 cron');
  });

  it('ok, no callers: "no downstream callers found"', () => {
    expect(
      formatBlastSummary({ status: 'ok', reason: null }, { symbols: 3, callers: 0, endpoints: 0, crons: 0 }),
    ).toBe('3 symbols changed, no downstream callers found.');
  });

  it('degraded, no callers: "Blast radius unavailable: <reason>."', () => {
    expect(
      formatBlastSummary(
        { status: 'degraded', reason: 'no_data' },
        { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      ),
    ).toBe('Blast radius unavailable: no_data.');
  });
});

describe('toBlastRadius (D5) — mapping', () => {
  const baseResult: BlastResult = {
    changedSymbols: [
      { file: 'b.ts', name: 'beta', kind: 'function' },
      { file: 'a.ts', name: 'alpha', kind: 'function' },
      { file: 'a.ts', name: 'AlphaHelper', kind: 'class' },
    ],
    callers: [
      { file: 'x.ts', symbol: 'callerX', viaSymbol: 'alpha', line: 10, rank: 5 },
      { file: 'y.ts', symbol: 'callerY', viaSymbol: 'alpha', line: 20, rank: 3 },
      { file: 'z.ts', symbol: 'callerZ', viaSymbol: 'beta', line: 30, rank: 1 },
    ],
    impactedEndpoints: ['GET /x'],
    factsByFile: {
      'x.ts': { endpoints: ['GET /x'], crons: [] },
      'y.ts': { endpoints: ['POST /y'], crons: ['0 * * * *'] },
      // z.ts intentionally missing — a missing entry counts as empty.
    },
    degraded: false,
  };
  const ok = { status: 'ok' as const, reason: null };

  it('changed_symbols sorted by file then name', () => {
    const mapped = toBlastRadius(baseResult, ok, 'sha1');
    expect(mapped.changed_symbols.map((s) => `${s.file}:${s.name}`)).toEqual([
      'a.ts:alpha',
      'a.ts:AlphaHelper',
      'b.ts:beta',
    ]);
  });

  it('groups callers by viaSymbol, in facade order, and excludes AlphaHelper (0 callers) from downstream but counts it in stats.symbols', () => {
    const mapped = toBlastRadius(baseResult, ok, 'sha1');
    expect(mapped.downstream.map((g) => g.symbol)).toEqual(['alpha', 'beta']); // sorted by caller count desc
    const alphaGroup = mapped.downstream.find((g) => g.symbol === 'alpha')!;
    expect(alphaGroup.callers.map((c) => c.name)).toEqual(['callerX', 'callerY']);
    expect(mapped.stats.symbols).toBe(3); // 3 changed symbols, only 2 have downstream groups
  });

  it('per-group endpoint/cron union is sorted; a caller file missing from factsByFile counts as empty', () => {
    const mapped = toBlastRadius(baseResult, ok, 'sha1');
    const alphaGroup = mapped.downstream.find((g) => g.symbol === 'alpha')!;
    expect(alphaGroup.endpoints_affected).toEqual(['GET /x', 'POST /y']);
    expect(alphaGroup.crons_affected).toEqual(['0 * * * *']);
    const betaGroup = mapped.downstream.find((g) => g.symbol === 'beta')!;
    expect(betaGroup.endpoints_affected).toEqual([]);
    expect(betaGroup.crons_affected).toEqual([]);
  });

  it('groups sorted by caller count desc, then symbol', () => {
    const tied: BlastResult = {
      ...baseResult,
      callers: [
        { file: 'x.ts', symbol: 'callerX', viaSymbol: 'zeta', line: 1, rank: 1 },
        { file: 'y.ts', symbol: 'callerY', viaSymbol: 'alpha', line: 1, rank: 1 },
      ],
    };
    const mapped = toBlastRadius(tied, ok, 'sha1');
    expect(mapped.downstream.map((g) => g.symbol)).toEqual(['alpha', 'zeta']); // tie broken by symbol name
  });

  it('stats: callers = sum of group lengths; endpoints/crons = union size across groups (match the chips)', () => {
    const mapped = toBlastRadius(baseResult, ok, 'sha1');
    expect(mapped.stats).toEqual({ symbols: 3, callers: 3, endpoints: 2, crons: 1 });
  });

  it('truncated: passes result.truncated through, defaulting to false', () => {
    expect(toBlastRadius(baseResult, ok, 'sha1').truncated).toBe(false);
    expect(toBlastRadius({ ...baseResult, truncated: true }, ok, 'sha1').truncated).toBe(true);
  });

  it('zero callers at all: downstream is empty, summary is the no-callers form', () => {
    const empty: BlastResult = { changedSymbols: baseResult.changedSymbols, callers: [], impactedEndpoints: [] };
    const mapped = toBlastRadius(empty, ok, 'sha1');
    expect(mapped.downstream).toEqual([]);
    expect(mapped.stats).toEqual({ symbols: 3, callers: 0, endpoints: 0, crons: 0 });
    expect(mapped.summary).toBe('3 symbols changed, no downstream callers found.');
  });

  it('carries status/degraded_reason/index_sha into the full response shape', () => {
    const degraded = { status: 'degraded' as const, reason: 'index_partial' as const };
    const mapped = toBlastRadius(baseResult, degraded, 'sha1');
    expect(mapped.status).toBe('degraded');
    expect(mapped.degraded_reason).toBe('index_partial');
    expect(mapped.index_sha).toBe('sha1');

    const okMapped = toBlastRadius(baseResult, ok, null);
    expect(okMapped.status).toBe('ok');
    expect(okMapped.degraded_reason).toBeNull();
    expect(okMapped.index_sha).toBeNull();
  });
});
