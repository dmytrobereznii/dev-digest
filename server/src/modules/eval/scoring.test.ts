import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EvalExpectationType, EvalRunFinding } from '@devdigest/shared';
import { matches, scoreCase, scoreRun, type ScoredCaseInput } from './scoring.js';

const span = (file: string, start_line: number, end_line: number) => ({ file, start_line, end_line });

function finding(file: string, start: number, end: number, extra: Partial<EvalRunFinding> = {}): EvalRunFinding {
  return {
    file,
    start_line: start,
    end_line: end,
    title: 'a title',
    severity: 'WARNING',
    category: 'bug',
    ...extra,
  };
}

let seq = 0;
function kase(
  type: EvalExpectationType,
  e: [string, number, number],
  kept: EvalRunFinding[] = [],
  dropped = 0,
): ScoredCaseInput {
  const n = seq++;
  return {
    case_id: `c${n}`,
    case_name: `case-${n}`,
    expectation: { type, file: e[0], start_line: e[1], end_line: e[2] },
    kept,
    dropped,
    duration_ms: 10,
    cost_usd: null,
  };
}

describe('matches', () => {
  it('a finding matches when the file is equal and the ranges share one line', () => {
    expect(matches(span('a.ts', 10, 12), span('a.ts', 12, 20))).toBe(true); // share only line 12
    expect(matches(span('a.ts', 12, 20), span('a.ts', 10, 12))).toBe(true);
    expect(matches(span('a.ts', 5, 5), span('a.ts', 5, 5))).toBe(true);
    expect(matches(span('a.ts', 1, 30), span('a.ts', 10, 12))).toBe(true); // containment
    expect(matches(span('a.ts', 10, 11), span('a.ts', 12, 20))).toBe(false); // adjacent, no shared line
    expect(matches(span('a.ts', 13, 14), span('a.ts', 10, 12))).toBe(false);
  });

  it('another file, or a path differing by case or prefix, does not match', () => {
    const e = span('src/App.ts', 10, 12);
    expect(matches(span('src/other.ts', 10, 12), e)).toBe(false);
    expect(matches(span('src/app.ts', 10, 12), e)).toBe(false);
    expect(matches(span('./src/App.ts', 10, 12), e)).toBe(false);
    expect(matches(span('a/src/App.ts', 10, 12), e)).toBe(false);
    expect(matches(span('src/App.ts', 10, 12), e)).toBe(true);
  });

  it('a range with start_line above end_line is normalised before matching', () => {
    expect(matches(span('a.ts', 12, 10), span('a.ts', 11, 11))).toBe(true);
    expect(matches(span('a.ts', 11, 11), span('a.ts', 12, 10))).toBe(true);
    expect(matches(span('a.ts', 12, 10), span('a.ts', 20, 15))).toBe(false);
    expect(matches(span('a.ts', 20, 10), span('a.ts', 15, 12))).toBe(true);
  });
});

describe('scoreCase', () => {
  it('must_find passes with one or more matches and fails with none', () => {
    const e = { type: 'must_find' as const, file: 'a.ts', start_line: 10, end_line: 12 };
    expect(scoreCase(e, [span('a.ts', 11, 11)], 0).pass).toBe(true);
    expect(scoreCase(e, [span('a.ts', 11, 11), span('a.ts', 12, 12)], 0).pass).toBe(true);
    expect(scoreCase(e, [span('a.ts', 40, 41)], 0).pass).toBe(false);
    expect(scoreCase(e, [], 3).pass).toBe(false);
  });

  it('must_not_flag passes with no match and fails with one', () => {
    const e = { type: 'must_not_flag' as const, file: 'a.ts', start_line: 10, end_line: 12 };
    expect(scoreCase(e, [], 0).pass).toBe(true);
    expect(scoreCase(e, [span('a.ts', 40, 41)], 0).pass).toBe(true);
    expect(scoreCase(e, [span('a.ts', 12, 13)], 0).pass).toBe(false);
  });
});

describe('scoreRun', () => {
  it('recall is must_find cases passed over all must_find cases', () => {
    const { metrics } = scoreRun([
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 2, 2)]), // pass
      kase('must_find', ['b.ts', 1, 5], [finding('b.ts', 2, 2)]), // pass
      kase('must_find', ['c.ts', 1, 5], []), // fail
      kase('must_find', ['d.ts', 1, 5], [finding('d.ts', 90, 91)]), // fail
      kase('must_not_flag', ['e.ts', 1, 5], []), // pass, not in recall
    ]);
    expect(metrics.recall).toBe(2 / 4);
  });

  it('precision is TP over TP plus FP, and two findings on one must_find count 2', () => {
    const { metrics, results } = scoreRun([
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 1, 1), finding('a.ts', 3, 4)]), // TP 2
      kase('must_not_flag', ['b.ts', 1, 5], [finding('b.ts', 2, 2)]), // FP 1
    ]);
    expect(results[0]!.matched).toBe(2);
    expect(metrics.precision).toBe(2 / 3);
  });

  it('citation_accuracy is surviving over surviving plus dropped across all cases', () => {
    const { metrics } = scoreRun([
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 1, 1), finding('a.ts', 2, 2)], 1),
      kase('must_not_flag', ['b.ts', 1, 5], [], 2),
      kase('must_find', ['c.ts', 1, 5], [finding('c.ts', 9, 9)], 0),
    ]);
    expect(metrics.citation_accuracy).toBe(3 / 6);
  });

  it('a surviving finding that matches nothing is unjudged and enters neither TP nor FP', () => {
    const { results, metrics } = scoreRun([
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 2, 2), finding('a.ts', 80, 81), finding('z.ts', 1, 1)]),
      kase('must_not_flag', ['b.ts', 1, 5], [finding('b.ts', 50, 51)]),
    ]);
    expect(results[0]).toMatchObject({ matched: 1, unjudged: 2, kept: 3 });
    expect(results[1]).toMatchObject({ matched: 0, unjudged: 1, kept: 1, pass: true });
    // TP = 1, FP = 0: the three unjudged findings would pull precision down if counted
    expect(metrics.precision).toBe(1);
  });

  it('a zero denominator gives null for recall, precision and citation_accuracy', () => {
    const empty = scoreRun([]).metrics;
    expect(empty.recall).toBeNull();
    expect(empty.precision).toBeNull();
    expect(empty.citation_accuracy).toBeNull();

    // only must_not_flag, nothing surviving or dropped: all three denominators are 0
    const onlyNeg = scoreRun([kase('must_not_flag', ['a.ts', 1, 5], [], 0)]).metrics;
    expect(onlyNeg.recall).toBeNull();
    expect(onlyNeg.precision).toBeNull();
    expect(onlyNeg.citation_accuracy).toBeNull();

    // a zero numerator over a non-zero denominator is 0, not null
    const zero = scoreRun([kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 90, 90)], 1)]).metrics;
    expect(zero.recall).toBe(0);
    expect(zero.precision).toBeNull();
    expect(zero.citation_accuracy).toBe(0.5);
  });

  it('changing severity, category, title and confidence changes nothing', () => {
    const build = (variant: 'a' | 'b') => {
      const x = variant === 'a'
        ? { title: 'one', severity: 'CRITICAL' as const, category: 'security' as const }
        : { title: 'completely different', severity: 'SUGGESTION' as const, category: 'style' as const };
      const conf = variant === 'a' ? { confidence: 0.99 } : { confidence: 0.01 };
      const mk = (f: string, s: number, e: number) => ({ ...finding(f, s, e), ...x, ...conf });
      return [
        { ...kase('must_find', ['a.ts', 1, 5], [mk('a.ts', 2, 2), mk('a.ts', 70, 71)], 1), case_id: 'k1', case_name: 'k1' },
        { ...kase('must_not_flag', ['b.ts', 1, 5], [mk('b.ts', 3, 3)], 0), case_id: 'k2', case_name: 'k2' },
      ];
    };
    const a = scoreRun(build('a'));
    const b = scoreRun(build('b'));
    expect(b.metrics).toEqual(a.metrics);
    const strip = (r: ReturnType<typeof scoreRun>['results']) =>
      r.map(({ findings: _f, ...rest }) => rest);
    expect(strip(b.results)).toEqual(strip(a.results));
  });

  it('the same input gives deep-equal output on repeated calls and is not mutated', () => {
    const input = [
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 2, 2), finding('a.ts', 60, 61)], 1),
      kase('must_not_flag', ['b.ts', 9, 3], [finding('b.ts', 4, 4)], 2),
    ];
    const before = structuredClone(input);
    const first = scoreRun(input);
    const second = scoreRun(input);
    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });

  it('scoring.ts imports only @devdigest/shared and scoreRun takes no provider', () => {
    const src = readFileSync(fileURLToPath(new URL('./scoring.ts', import.meta.url)), 'utf8');
    const specifiers = [...src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    const bare = [...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    const dynamic = [...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const requires = [...src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    expect([...specifiers, ...bare, ...dynamic, ...requires].every((s) => s === '@devdigest/shared')).toBe(true);
    // one parameter: the cases. No provider, client or options argument.
    expect(scoreRun.length).toBe(1);
  });

  it('traces_passed counts passed cases and traces_total all cases', () => {
    const { metrics, results } = scoreRun([
      kase('must_find', ['a.ts', 1, 5], [finding('a.ts', 2, 2)]), // pass
      kase('must_find', ['b.ts', 1, 5], []), // fail
      kase('must_not_flag', ['c.ts', 1, 5], []), // pass
      kase('must_not_flag', ['d.ts', 1, 5], [finding('d.ts', 1, 1)]), // fail
      kase('must_not_flag', ['e.ts', 1, 5], [finding('x.ts', 1, 1)]), // pass
    ]);
    expect(results.map((r) => r.pass)).toEqual([true, false, true, false, true]);
    expect(metrics.traces_passed).toBe(3);
    expect(metrics.traces_total).toBe(5);
  });
});
