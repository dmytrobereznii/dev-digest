import type { ProjectDocumentType } from '@devdigest/shared';
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
