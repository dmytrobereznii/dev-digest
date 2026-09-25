import type { PrMeta } from '@devdigest/shared';
import { deriveReviewStatus } from './status.js';

/**
 * The structural, camelCase shape `toPrMeta` needs from a persisted PR row.
 * Deliberately not `PullRow` (`db/rows.ts`) — this module takes no `db/`
 * import, so the clock (`now`) and the derived-status policy stay out of the
 * repository (D5).
 */
export interface PrMetaSource {
  id: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  lastReviewedSha: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Map a persisted PR row to the wire `PrMeta` shape, lifted from the
 * `GET /repos/:id/pulls` list handler. `status` is DERIVED (see `./status.ts`)
 * from the GitHub merge state plus review freshness, evaluated at `now` —
 * callers pass `Date.now()` from the service, never from here.
 *
 * `score`, `cost_usd` and `findings` are list-endpoint-only aggregates the
 * caller adds on top; this mapper never sets them.
 */
export function toPrMeta(src: PrMetaSource, now: number): PrMeta {
  return {
    id: src.id,
    number: src.number,
    title: src.title,
    author: src.author,
    branch: src.branch,
    base: src.base,
    head_sha: src.headSha,
    additions: src.additions,
    deletions: src.deletions,
    files_count: src.filesCount,
    status: deriveReviewStatus({
      ghStatus: src.status,
      lastReviewedSha: src.lastReviewedSha,
      headSha: src.headSha,
      updatedAt: src.updatedAt,
      now,
    }),
    opened_at: src.openedAt?.toISOString() ?? null,
    updated_at: src.updatedAt?.toISOString() ?? null,
  };
}
