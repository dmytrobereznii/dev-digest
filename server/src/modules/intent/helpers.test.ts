import { describe, it, expect } from 'vitest';
import { contentFromAddedPatch, isStale, prTextHash, toRecord } from './helpers.js';
import type { IntentRow } from './repository.js';

/**
 * T5 — the pure half of the intent module: the freshness key, the "PR's own
 * added file" reconstruction, and the row → API-record mapping. No DB.
 */

describe('prTextHash', () => {
  it('is stable for the same title + body', () => {
    const a = prTextHash('Add rate limiting', 'Prevents abuse from unauthenticated clients.');
    const b = prTextHash('Add rate limiting', 'Prevents abuse from unauthenticated clients.');
    expect(a).toBe(b);
  });

  it('changes when either half changes', () => {
    const base = prTextHash('Add rate limiting', 'Prevents abuse.');
    expect(prTextHash('Add rate limiting v2', 'Prevents abuse.')).not.toBe(base);
    expect(prTextHash('Add rate limiting', 'Prevents abuse, differently.')).not.toBe(base);
  });

  it('treats a null/undefined body the same as an empty one', () => {
    expect(prTextHash('T', null)).toBe(prTextHash('T', ''));
    expect(prTextHash('T', undefined)).toBe(prTextHash('T', ''));
  });
});

describe('isStale', () => {
  const pull = { headSha: 'sha-1', title: 'Add rate limiting', body: 'Prevents abuse.' };

  it('false when both head_sha and pr_text_hash still match', () => {
    const row = { headSha: 'sha-1', prTextHash: prTextHash(pull.title, pull.body) };
    expect(isStale(row, pull)).toBe(false);
  });

  it('true when head_sha moved', () => {
    const row = { headSha: 'sha-OLD', prTextHash: prTextHash(pull.title, pull.body) };
    expect(isStale(row, pull)).toBe(true);
  });

  it('true when the title/body changed (head_sha unchanged)', () => {
    const row = { headSha: 'sha-1', prTextHash: prTextHash('a different title', pull.body) };
    expect(isStale(row, pull)).toBe(true);
  });

  it('true before any derivation (both null)', () => {
    expect(isStale({ headSha: null, prTextHash: null }, pull)).toBe(true);
  });
});

describe('contentFromAddedPatch', () => {
  it('rebuilds content from a pure-addition hunk', () => {
    const patch = '@@ -0,0 +1,3 @@\n+line one\n+line two\n+line three';
    expect(contentFromAddedPatch(patch)).toBe('line one\nline two\nline three');
  });

  it('rebuilds a single-line addition (no comma in the hunk header)', () => {
    const patch = '@@ -0,0 +1 @@\n+only line';
    expect(contentFromAddedPatch(patch)).toBe('only line');
  });

  it('returns null for a modified file (has context/deletion lines)', () => {
    const patch = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    expect(contentFromAddedPatch(patch)).toBeNull();
  });

  it('returns null for a patch with more than one hunk', () => {
    const patch = '@@ -0,0 +1,1 @@\n+a\n@@ -0,0 +3,1 @@\n+b';
    expect(contentFromAddedPatch(patch)).toBeNull();
  });

  it('returns null for a missing patch', () => {
    expect(contentFromAddedPatch(null)).toBeNull();
    expect(contentFromAddedPatch(undefined)).toBeNull();
  });
});

describe('toRecord', () => {
  const pull = { headSha: 'sha-1', title: 'Add rate limiting', body: 'Prevents abuse.' };
  const row: IntentRow = {
    prId: 'pr-1',
    intent: 'Add rate limiting to public endpoints.',
    inScope: ['Add middleware'],
    outOfScope: ['Auth changes'],
    confidence: 'high',
    signals: ['title', 'description'],
    sources: [],
    model: 'anthropic/claude-haiku-4.5',
    costUsd: 0.002,
    tokensIn: 100,
    tokensOut: 20,
    headSha: 'sha-1',
    prTextHash: prTextHash(pull.title, pull.body),
    derivedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('maps every column and computes `stale` live against the current pull', () => {
    const record = toRecord(row, pull);
    expect(record).toEqual({
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      pr_id: 'pr-1',
      confidence: 'high',
      signals: ['title', 'description'],
      sources: [],
      model: row.model,
      cost_usd: row.costUsd,
      tokens_in: 100,
      tokens_out: 20,
      head_sha: 'sha-1',
      derived_at: '2026-01-01T00:00:00.000Z',
      stale: false,
    });
  });

  it('reports stale: true once the pull has moved on', () => {
    const record = toRecord(row, { ...pull, headSha: 'sha-2' });
    expect(record.stale).toBe(true);
  });
});
