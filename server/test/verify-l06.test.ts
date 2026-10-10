import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateReport, REQUIRED_FILES } from './verify/report';

const SCORING = '/repo/server/src/modules/eval/scoring.test.ts';
const CONTRACTS = '/repo/server/test/eval-contracts.test.ts';
const RUNS = '/repo/server/test/eval-runs.it.test.ts';

type Status = 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';

function file(name: string, tests: Array<[string, Status]>) {
  return {
    name,
    assertionResults: tests.map(([fullName, status]) => ({ fullName, status })),
  };
}

function greenReport() {
  return {
    testResults: [
      file(SCORING, [['scoring a', 'passed'], ['scoring b', 'passed']]),
      file(CONTRACTS, [['contracts identical', 'passed']]),
      file(RUNS, [['run route completes', 'passed']]),
    ],
  };
}

describe('verify:l06 report verdict', () => {
  it('every required file present with every test passed is ok', () => {
    expect(evaluateReport(greenReport())).toEqual({ ok: true, reasons: [] });
  });

  it('a failed scorer test is not ok and is named', () => {
    const report = greenReport();
    report.testResults[0] = file(SCORING, [
      ['scores must_find hit', 'passed'],
      ['scores must_not_flag miss', 'failed'],
    ]);
    const v = evaluateReport(report);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toContain('scores must_not_flag miss');
    expect(v.reasons.join('\n')).toContain('src/modules/eval/scoring.test.ts');
  });

  it('a skipped run-route test is not ok', () => {
    const report = greenReport();
    report.testResults[2] = file(RUNS, [['run route completes', 'skipped']]);
    const v = evaluateReport(report);
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toContain('test/eval-runs.it.test.ts');
  });

  it('a required file missing from the report is not ok', () => {
    const report = greenReport();
    report.testResults = report.testResults.filter((f) => f.name !== RUNS);
    const v = evaluateReport(report);
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(['test/eval-runs.it.test.ts: missing from the report']);
  });

  it('a failed contract-identity test or a failed provider-call test is not ok', () => {
    const contractsFailed = greenReport();
    contractsFailed.testResults[1] = file(CONTRACTS, [['contracts identical', 'failed']]);
    const a = evaluateReport(contractsFailed);
    expect(a.ok).toBe(false);
    expect(a.reasons.join('\n')).toContain('contracts identical');

    const providerCalled = greenReport();
    providerCalled.testResults[0] = file(SCORING, [
      ['scores a case', 'passed'],
      ['scoring never calls an LLM provider', 'failed'],
    ]);
    const b = evaluateReport(providerCalled);
    expect(b.ok).toBe(false);
    expect(b.reasons.join('\n')).toContain('scoring never calls an LLM provider');
  });

  it('the required list is scoring.test.ts, eval-contracts.test.ts and eval-runs.it.test.ts', () => {
    expect(REQUIRED_FILES.map((f) => f.split('/').pop())).toEqual([
      'scoring.test.ts',
      'eval-contracts.test.ts',
      'eval-runs.it.test.ts',
    ]);
  });

  it("the Makefile's verify-l06 recipe is cd server && pnpm verify:l06", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const makefile = readFileSync(resolve(here, '../../Makefile'), 'utf8').split('\n');
    const start = makefile.findIndex((l) => /^verify-l06:/.test(l));
    expect(start).toBeGreaterThanOrEqual(0);
    const recipe: string[] = [];
    for (const line of makefile.slice(start + 1)) {
      if (!line.startsWith('\t')) break;
      recipe.push(line.trim());
    }
    expect(recipe).toEqual(['cd server && pnpm verify:l06']);
  });
});
