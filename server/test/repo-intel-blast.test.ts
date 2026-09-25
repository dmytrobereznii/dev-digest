import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * T1 — the facade's per-symbol cap fix (spec 10 D2). No Postgres: `repo`
 * (RepoIntelRepository) is patched the way `repo-intel-facade-degraded.test.ts`
 * does, with `config.repoIntelEnabled: true` and `tryGetIndexState` reporting
 * a `full` index so `tryPersistentBlast` runs.
 *
 * `getSymbolRows` branches on the `paths` it's called with: the changed-files
 * call (`['a.ts', 'b.ts']`) returns the two declared symbols; any other call
 * (caller files) returns `[]` so `enclosingFromRows` falls back to the caller
 * file's basename — irrelevant to what this test checks.
 */

const CHANGED_FILES = ['a.ts', 'b.ts'];
const DECL_ROWS = [
  { path: 'a.ts', name: 'A', kind: 'function', line: 1, endLine: 5, exported: true, signature: 'function A()' },
  { path: 'b.ts', name: 'B', kind: 'function', line: 1, endLine: 5, exported: true, signature: 'function B()' },
];

function buildService(opts: {
  callerRows: Array<{ fromPath: string; toSymbol: string; line: number; rank: number }>;
  getFileFacts: ReturnType<typeof vi.fn>;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => ({ status: 'full' } as unknown as IndexState),
    getSymbolRows: async (_repoId: string, paths: string[]) => {
      const isDeclQuery = paths.length > 0 && paths.every((p) => CHANGED_FILES.includes(p));
      return isDeclQuery ? DECL_ROWS : [];
    },
    getResolvedCallers: async () => opts.callerRows,
    getFileFacts: opts.getFileFacts,
  };
  return svc;
}

/** `caller-<sym>-<i>.ts`, rank descending as `i` climbs (0 = highest rank). */
function callersFor(sym: string, count: number, rankBase: number) {
  return Array.from({ length: count }, (_, i) => ({
    fromPath: `caller-${sym}-${i}.ts`,
    toSymbol: sym,
    line: i + 1,
    rank: rankBase - i,
  }));
}

describe('tryPersistentBlast — per-symbol cap (D2)', () => {
  it('25 callers of A + 3 of B: A keeps the top 20 by rank, B keeps all 3, truncated: true, getFileFacts sees only the kept files', async () => {
    const callerRows = [...callersFor('A', 25, 100), ...callersFor('B', 3, 200)];
    const getFileFacts = vi.fn(async () => []);
    const svc = buildService({ callerRows, getFileFacts });

    const result = await svc.getBlastRadius('r1', CHANGED_FILES);

    expect(result.degraded).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.callers).toHaveLength(23); // 20 of A + 3 of B

    const aCallers = result.callers.filter((c) => c.viaSymbol === 'A');
    expect(aCallers).toHaveLength(20);
    // Top 20 by rank = i = 0..19 (rank 100..81); i = 20..24 (rank 80..76) are cut.
    const aFiles = new Set(aCallers.map((c) => c.file));
    for (let i = 0; i < 20; i += 1) expect(aFiles.has(`caller-A-${i}.ts`)).toBe(true);
    for (let i = 20; i < 25; i += 1) expect(aFiles.has(`caller-A-${i}.ts`)).toBe(false);

    const bCallers = result.callers.filter((c) => c.viaSymbol === 'B');
    expect(bCallers).toHaveLength(3);

    expect(getFileFacts).toHaveBeenCalledTimes(1);
    const [, keptFiles] = getFileFacts.mock.calls[0]!;
    expect(new Set(keptFiles as string[])).toEqual(new Set(result.callers.map((c) => c.file)));
    expect((keptFiles as string[])).toHaveLength(23); // not the full 28
  });

  it('exactly 20 callers of A: truncated is falsy', async () => {
    const callerRows = callersFor('A', 20, 100);
    const getFileFacts = vi.fn(async () => []);
    const svc = buildService({ callerRows, getFileFacts });

    const result = await svc.getBlastRadius('r1', CHANGED_FILES);

    expect(result.degraded).toBe(false);
    expect(result.truncated).toBeFalsy();
    expect(result.callers).toHaveLength(20);
  });
});
