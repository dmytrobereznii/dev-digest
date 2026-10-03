import type { ProjectDocumentType, SpecSkipped } from '@devdigest/shared';
import { DOCUMENT_TYPE_DIRS } from './constants.js';

/** The nearest `specs`, `docs` or `insights` directory of a path, else `other`. */
export function documentType(path: string): ProjectDocumentType {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const hit = DOCUMENT_TYPE_DIRS.find((d) => d === dirs[i]);
    if (hit) return hit;
  }
  return 'other';
}

/** An attached document in injection order; `source` is `agent` or a skill id. */
export type InjectionCandidate = { path: string; source: string };

export type InjectionPlan = {
  /** Injected documents in prompt order, each once, with every source that attached it. */
  injected: Array<{ path: string; tokens: number; sources: string[] }>;
  skipped: SpecSkipped[];
};

/**
 * Decide which attached documents reach the prompt. Dedupes by path (first
 * occurrence fixes the position); a path not in `listedPaths`, or whose
 * `tokensOf` is null (unreadable), is `missing`; then a running token sum is
 * kept, and the first document that overflows `budget` and every later listed
 * one is `over_budget`.
 */
export function planInjection(
  candidates: ReadonlyArray<InjectionCandidate>,
  listedPaths: Iterable<string>,
  tokensOf: (path: string) => number | null,
  budget: number,
): InjectionPlan {
  const listed = new Set(listedPaths);
  const order: string[] = [];
  const sources = new Map<string, string[]>();
  for (const c of candidates) {
    const known = sources.get(c.path);
    if (known) {
      if (!known.includes(c.source)) known.push(c.source);
    } else {
      sources.set(c.path, [c.source]);
      order.push(c.path);
    }
  }
  const injected: InjectionPlan['injected'] = [];
  const skipped: SpecSkipped[] = [];
  let used = 0;
  let overflowed = false;
  for (const path of order) {
    const tokens = listed.has(path) ? tokensOf(path) : null;
    if (tokens === null) {
      skipped.push({ path, reason: 'missing' });
      continue;
    }
    if (overflowed || used + tokens > budget) {
      overflowed = true;
      skipped.push({ path, reason: 'over_budget' });
      continue;
    }
    used += tokens;
    injected.push({ path, tokens, sources: sources.get(path)! });
  }
  return { injected, skipped };
}

/** Injected paths attached to one source (a skill id), in injection order. */
export function skillSpecPaths(plan: InjectionPlan, source: string): string[] {
  return plan.injected.filter((d) => d.sources.includes(source)).map((d) => d.path);
}

/** Number of distinct agents per path from (path, agentId) usage pairs. */
export function countAgentsByPath(
  usage: ReadonlyArray<{ path: string; agentId: string }>,
): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const u of usage) {
    let set = seen.get(u.path);
    if (!set) seen.set(u.path, (set = new Set()));
    set.add(u.agentId);
  }
  return new Map([...seen].map(([path, set]) => [path, set.size]));
}
