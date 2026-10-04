import { describe, it, expect } from 'vitest';
import type { BlastRadiusResponse, PrBriefStored, Risk } from '@devdigest/shared';
import {
  briefLogFields,
  changedRanges,
  groundBrief,
  isBlastAvailable,
  parseFileRef,
  toRecord,
} from './helpers.js';

const PATCH = '@@ -1,3 +10,5 @@\n context\n+added\n@@ -30 +40 @@\n-old\n+new';
// New-side ranges of PATCH: 10-14 and 40-40.
const FILES = [
  { path: 'src/a.ts', patch: PATCH },
  { path: 'src/b.ts', patch: null },
];

const risk = (file_refs: string[], title = 'r'): Risk => ({
  kind: 'security',
  title,
  explanation: 'e',
  severity: 'high',
  file_refs,
});

describe('changedRanges', () => {
  it('reads the new-side range of each hunk header and skips a zero-length hunk', () => {
    const patch = [
      '@@ -1,3 +10,4 @@ fn()',
      ' ctx',
      '+a',
      '@@ -20 +30 @@',
      '+b',
      '@@ -40,2 +0,0 @@',
      '-gone',
      '-gone',
      '@@ -50,1 +60,3 @@',
      '+c',
    ].join('\n');
    expect(changedRanges(patch)).toEqual([
      { start: 10, end: 13 },
      { start: 30, end: 30 },
      { start: 60, end: 62 },
    ]);
  });

  it('is empty for a missing patch', () => {
    expect(changedRanges(null)).toEqual([]);
    expect(changedRanges('')).toEqual([]);
  });
});

describe('parseFileRef', () => {
  it('splits path, path:line and path:start-end', () => {
    expect(parseFileRef('src/a.ts')).toEqual({ path: 'src/a.ts', start: null, end: null });
    expect(parseFileRef('src/a.ts:12')).toEqual({ path: 'src/a.ts', start: 12, end: 12 });
    expect(parseFileRef('src/a.ts:12-20')).toEqual({ path: 'src/a.ts', start: 12, end: 20 });
  });
});

describe('groundBrief', () => {
  it('omits a review_focus item whose file is not a changed file', () => {
    const out = groundBrief(
      { risks: [], review_focus: [{ file: 'src/other.ts', line: 10, reason: 'x' }] },
      FILES,
    );
    expect(out.review_focus).toEqual([]);
  });

  it('omits a review_focus item whose line is outside every changed range', () => {
    const out = groundBrief(
      {
        risks: [],
        review_focus: [
          { file: 'src/a.ts', line: 20, reason: 'between hunks' },
          { file: 'src/a.ts', line: 9, reason: 'just before' },
          { file: 'src/a.ts', line: 41, reason: 'just after' },
          { file: 'src/a.ts', line: 40, reason: 'inside' },
        ],
      },
      FILES,
    );
    expect(out.review_focus.map((i) => i.reason)).toEqual(['inside']);
  });

  it('removes a file reference that names no changed file', () => {
    const out = groundBrief({ risks: [risk(['src/nope.ts:3', 'src/a.ts:11'])], review_focus: [] }, FILES);
    expect(out.risks[0]!.file_refs).toEqual(['src/a.ts:11']);
  });

  it('omits a risk left with no file reference', () => {
    const out = groundBrief(
      { risks: [risk(['src/nope.ts']), risk([]), risk(['src/a.ts'], 'kept')], review_focus: [] },
      FILES,
    );
    expect(out.risks.map((r) => r.title)).toEqual(['kept']);
  });

  it('keeps the path alone when the lines overlap no changed range', () => {
    const out = groundBrief(
      { risks: [risk(['src/a.ts:25', 'src/a.ts:20-30'])], review_focus: [] },
      FILES,
    );
    expect(out.risks[0]!.file_refs).toEqual(['src/a.ts']);
  });

  it('keeps a line reference that overlaps a changed range, and a path-only file without a patch', () => {
    const out = groundBrief(
      { risks: [risk(['src/a.ts:8-10', 'src/b.ts:5'])], review_focus: [] },
      FILES,
    );
    expect(out.risks[0]!.file_refs).toEqual(['src/a.ts:8-10', 'src/b.ts']);
  });

  it('counts omitted risks and review_focus items', () => {
    const out = groundBrief(
      {
        risks: [risk(['src/nope.ts']), risk(['src/a.ts']), risk(['x.ts'])],
        review_focus: [
          { file: 'src/a.ts', line: 10, reason: 'ok' },
          { file: 'src/a.ts', line: 500, reason: 'bad line' },
          { file: 'zzz.ts', line: 1, reason: 'bad file' },
        ],
      },
      FILES,
    );
    expect(out.risks).toHaveLength(1);
    expect(out.review_focus).toHaveLength(1);
    expect(out.dropped).toEqual({ risks: 2, review_focus: 2 });
  });

  it("keeps review_focus in the model's order", () => {
    const out = groundBrief(
      {
        risks: [],
        review_focus: [
          { file: 'src/a.ts', line: 40, reason: 'third in file order, first returned' },
          { file: 'src/a.ts', line: 11, reason: 'second' },
          { file: 'src/a.ts', line: 10, reason: 'third' },
        ],
      },
      FILES,
    );
    expect(out.review_focus.map((i) => i.line)).toEqual([40, 11, 10]);
  });

  it('matches a path exactly: a ./ or a/ prefix, a different case or a trailing space is not a changed file', () => {
    const variants = ['./src/a.ts', 'a/src/a.ts', 'src/A.ts', 'src/a.ts '];
    const out = groundBrief(
      {
        risks: variants.map((v) => risk([v, `${v}:11`])),
        review_focus: variants.map((v) => ({ file: v, line: 11, reason: v })),
      },
      FILES,
    );
    expect(out.risks).toEqual([]);
    expect(out.review_focus).toEqual([]);
    expect(out.dropped).toEqual({ risks: 4, review_focus: 4 });

    const exact = groundBrief(
      { risks: [], review_focus: [{ file: 'src/a.ts', line: 11, reason: 'exact' }] },
      FILES,
    );
    expect(exact.review_focus).toHaveLength(1);
  });
});

const blast = (over: Partial<BlastRadiusResponse>): BlastRadiusResponse => ({
  changed_symbols: [],
  downstream: [],
  summary: '',
  status: 'degraded',
  degraded_reason: 'no_data',
  index_sha: null,
  stats: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  truncated: false,
  ...over,
});

describe('isBlastAvailable', () => {
  it('is true with a changed symbol or status ok', () => {
    expect(
      isBlastAvailable(blast({ changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'function' }] })),
    ).toBe(true);
    expect(isBlastAvailable(blast({ status: 'ok', degraded_reason: null }))).toBe(true);
  });

  it('is false for a degraded read with no symbol, and for null', () => {
    expect(isBlastAvailable(blast({}))).toBe(false);
    expect(isBlastAvailable(null)).toBe(false);
  });
});

const stored = (over: Partial<PrBriefStored> = {}): PrBriefStored => ({
  pr_id: '11111111-1111-4111-8111-111111111111',
  summary: 's',
  intent: null,
  blast: null,
  risks: { risks: [] },
  review_focus: [],
  history: { history: [] },
  head_sha: 'sha-1',
  generated_at: '2026-10-03T00:00:00.000Z',
  model: 'anthropic/claude-haiku-4.5',
  tokens_in: 120,
  tokens_out: 45,
  cost_usd: 0.002,
  missing_inputs: ['blast', 'specs'],
  specs_used: [],
  dropped: { risks: 1, review_focus: 2 },
  ...over,
});

describe('briefLogFields', () => {
  it('carries pr id, model, tokens, cost, missing_inputs and dropped', () => {
    expect(briefLogFields(stored())).toEqual({
      prId: '11111111-1111-4111-8111-111111111111',
      model: 'anthropic/claude-haiku-4.5',
      tokensIn: 120,
      tokensOut: 45,
      costUsd: 0.002,
      missingInputs: ['blast', 'specs'],
      dropped: { risks: 1, review_focus: 2 },
    });
  });
});

describe('toRecord', () => {
  it('marks the brief stale when head_sha differs from the PR head', () => {
    expect(toRecord(stored(), { headSha: 'sha-2' }).stale).toBe(true);
    expect(toRecord(stored(), { headSha: 'sha-1' }).stale).toBe(false);
  });

  it('keeps the stored head_sha and fields', () => {
    const rec = toRecord(stored(), { headSha: 'sha-2' });
    expect(rec.head_sha).toBe('sha-1');
    expect(rec.summary).toBe('s');
  });
});
