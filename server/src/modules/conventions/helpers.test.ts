import { describe, it, expect } from 'vitest';
import {
  dedupeKey,
  groundCandidate,
  locateSnippet,
  normalizeSnippet,
  parseEvidencePath,
} from './helpers.js';

/**
 * The gate and the merge format — the two pure halves of this module, and the
 * two worth testing. No DB, no clone: `groundCandidate` is handed file CONTENTS,
 * which is the whole reason it takes them as an argument (§3.4).
 */

const PAYMENTS = [
  "import { logger } from '../lib/logger';",
  '',
  'export async function capture(id: string) {',
  '  const charge = await gateway.capture(id);',
  '  if (!charge.ok) throw new PaymentError(charge.reason);',
  '  return charge;',
  '}',
].join('\n');

/** The rule text the design's fixture uses, so the slugs here are the real ones. */
const ASYNC_RULE = 'Always use `async/await` instead of raw Promise chains';
const RESULT_RULE = 'Return a typed `Result` instead of throwing from a service';
const REDIS_RULE = 'Access Redis through the shared singleton client';

describe('parseEvidencePath', () => {
  it('accepts a bare path', () => {
    expect(parseEvidencePath('src/services/payments.ts')).toEqual({
      path: 'src/services/payments.ts',
    });
  });

  it('accepts a line range', () => {
    expect(parseEvidencePath('src/services/payments.ts:12-20')).toEqual({
      path: 'src/services/payments.ts',
      start: 12,
      end: 20,
    });
  });

  it('accepts a single line', () => {
    expect(parseEvidencePath('src/services/payments.ts:12')).toEqual({
      path: 'src/services/payments.ts',
      start: 12,
    });
  });

  it('returns null for garbage', () => {
    // Not a path at all; a bare line hint; an absolute path; a traversal; a
    // colon the strip could not account for; nothing.
    expect(parseEvidencePath('the service layer, generally')).toBeNull();
    expect(parseEvidencePath(':12')).toBeNull();
    expect(parseEvidencePath('/etc/passwd')).toBeNull();
    expect(parseEvidencePath('../../secrets.json')).toBeNull();
    expect(parseEvidencePath('src/a.ts:abc')).toBeNull();
    expect(parseEvidencePath('   ')).toBeNull();
  });
});

describe('normalizeSnippet', () => {
  it('drops blank lines and collapses whitespace runs', () => {
    expect(normalizeSnippet('  const  a =   1;\n\n\tif (a) {\n')).toEqual([
      'const a = 1;',
      'if (a) {',
    ]);
  });
});

describe('locateSnippet', () => {
  const lines = PAYMENTS.split('\n');

  it('finds a quote whose indentation and spacing were reflowed', () => {
    expect(locateSnippet(lines, 'const charge   =  await gateway.capture(id);')).toEqual({
      start: 4,
      end: 4,
    });
  });

  it('reports the real first and last line of a multi-line quote', () => {
    expect(
      locateSnippet(lines, 'export async function capture(id: string) {\n\nreturn charge;'),
    ).toEqual({ start: 3, end: 6 });
  });

  it('returns null when the text is not in the file', () => {
    expect(locateSnippet(lines, 'return gateway.capture(id).then(ok);')).toBeNull();
  });
});

describe('groundCandidate (D6)', () => {
  const files = new Map([['src/services/payments.ts', PAYMENTS]]);

  const candidate = (over: Partial<Parameters<typeof groundCandidate>[0]> = {}) => ({
    rule: ASYNC_RULE,
    evidence_path: 'src/services/payments.ts:4',
    evidence_snippet: '  const charge = await gateway.capture(id);',
    confidence: 0.91,
    ...over,
  });

  it('keeps a candidate whose snippet is at the claimed line', () => {
    expect(groundCandidate(candidate(), files)).toEqual({
      rule: ASYNC_RULE,
      evidence_path: 'src/services/payments.ts:4',
      evidence_snippet: '  const charge = await gateway.capture(id);',
      confidence: 0.91,
    });
  });

  it('REPAIRS the range when the snippet is somewhere else, rather than dropping it', () => {
    const grounded = groundCandidate(candidate({ evidence_path: 'src/services/payments.ts:118-140' }), files);
    // Models quote accurately and count lines badly; the line number is the one
    // part of the answer we can recompute, so it is recomputed.
    expect(grounded?.evidence_path).toBe('src/services/payments.ts:4');
    expect(grounded?.evidence_snippet).toBe('  const charge = await gateway.capture(id);');
  });

  it('drops a candidate whose snippet is not in the file (a fabricated quote)', () => {
    expect(
      groundCandidate(
        candidate({ evidence_snippet: 'const charge = await gateway.captureCharge(id, opts);' }),
        files,
      ),
    ).toBeNull();
  });

  it('drops a candidate citing a file that was never sampled', () => {
    expect(groundCandidate(candidate({ evidence_path: 'src/services/refunds.ts:4' }), files)).toBeNull();
  });

  it('clamps confidence and defaults a missing one to 0.5', () => {
    expect(groundCandidate(candidate({ confidence: 4.2 }), files)?.confidence).toBe(1);
    expect(groundCandidate(candidate({ confidence: -1 }), files)?.confidence).toBe(0);
    expect(groundCandidate(candidate({ confidence: undefined }), files)?.confidence).toBe(0.5);
  });
});

describe('dedupeKey (D3)', () => {
  it('collapses casing and punctuation so a re-scan suppresses a settled rule', () => {
    expect(dedupeKey('Always use `async/await` instead of raw Promise chains')).toBe(
      dedupeKey('always use async await, instead of raw promise chains.'),
    );
  });

  it('does not collapse two genuinely different rules', () => {
    expect(dedupeKey(ASYNC_RULE)).not.toBe(dedupeKey(RESULT_RULE));
  });
});
