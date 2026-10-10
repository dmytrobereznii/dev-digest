/**
 * Pure verdict for `pnpm verify:l06`. Reads a vitest JSON report and says
 * whether every required file ran and passed. A file passes only when it is
 * present with at least one passed test and no test in any other state, so a
 * self-skipped integration suite (no Docker) is never green.
 */

export const REQUIRED_FILES = [
  'src/modules/eval/scoring.test.ts',
  'test/eval-contracts.test.ts',
  'test/eval-runs.it.test.ts',
] as const;

export interface ReportAssertion {
  status: string;
  fullName?: string;
  title?: string;
}

export interface ReportFile {
  name: string;
  status?: string;
  message?: string;
  assertionResults?: ReportAssertion[];
}

export interface VitestReport {
  testResults?: ReportFile[];
}

export interface Verdict {
  ok: boolean;
  reasons: string[];
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function matches(reportName: string, required: string): boolean {
  const n = normalize(reportName);
  return n === required || n.endsWith(`/${required}`);
}

export function evaluateReport(report: VitestReport | null | undefined): Verdict {
  const reasons: string[] = [];
  const files = report?.testResults ?? [];

  for (const required of REQUIRED_FILES) {
    const entry = files.find((f) => matches(f.name, required));
    if (!entry) {
      reasons.push(`${required}: missing from the report`);
      continue;
    }
    const tests = entry.assertionResults ?? [];
    for (const t of tests) {
      if (t.status !== 'passed') {
        reasons.push(`${required}: ${t.status} - ${t.fullName ?? t.title ?? '(unnamed test)'}`);
      }
    }
    if (!tests.some((t) => t.status === 'passed')) {
      const why = entry.message ? ` (${entry.message.split('\n')[0]})` : '';
      reasons.push(`${required}: no passed test${why}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
