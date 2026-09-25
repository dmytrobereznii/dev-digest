import { describe, it, expect } from 'vitest';
import { toPrMeta, type PrMetaSource } from './helpers.js';

/**
 * `toPrMeta` maps every `PrMetaSource` field and derives `status` from
 * `deriveReviewStatus`'s inputs (`./status.ts`) — this is a pure re-check of
 * that mapping at the boundary this module owns, not a re-test of the derive
 * rules themselves.
 */

const BASE: PrMetaSource = {
  id: 'pr-uuid-1',
  number: 482,
  title: 'Add rate limiting to public API endpoints',
  author: 'marisa.koch',
  branch: 'feat/rate-limit-public',
  base: 'main',
  headSha: 'a1b2c3d4e5f6',
  additions: 247,
  deletions: 38,
  filesCount: 9,
  status: 'open',
  lastReviewedSha: null,
  openedAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T03:00:00.000Z'),
};

const NOW = new Date('2026-06-02T00:00:00.000Z').getTime();

describe('toPrMeta', () => {
  it('maps every field of an open, never-reviewed PR (needs_review)', () => {
    expect(toPrMeta(BASE, NOW)).toEqual({
      id: 'pr-uuid-1',
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'a1b2c3d4e5f6',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'needs_review',
      opened_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T03:00:00.000Z',
    });
  });

  it('derives reviewed when the last-reviewed sha matches head and is recent', () => {
    const src: PrMetaSource = { ...BASE, lastReviewedSha: BASE.headSha };
    expect(toPrMeta(src, NOW).status).toBe('reviewed');
  });

  it('derives stale when a matching review has aged past STALE_DAYS', () => {
    const src: PrMetaSource = { ...BASE, lastReviewedSha: BASE.headSha };
    const farFuture = src.updatedAt!.getTime() + 8 * 86_400_000;
    expect(toPrMeta(src, farFuture).status).toBe('stale');
  });

  it('passes GitHub merge state through unchanged for merged/closed PRs', () => {
    expect(toPrMeta({ ...BASE, status: 'merged' }, NOW).status).toBe('merged');
    expect(toPrMeta({ ...BASE, status: 'closed' }, NOW).status).toBe('closed');
  });

  it('maps null opened_at/updated_at to null, not undefined', () => {
    const src: PrMetaSource = { ...BASE, openedAt: null, updatedAt: null };
    const meta = toPrMeta(src, NOW);
    expect(meta.opened_at).toBeNull();
    expect(meta.updated_at).toBeNull();
  });
});
