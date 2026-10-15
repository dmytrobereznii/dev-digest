/**
 * `pnpm verify:l06` - runs the three L06 eval suites with no provider key in
 * the child's environment, reads vitest's JSON report, and exits non-zero
 * unless every required file ran and passed (a skipped file counts as failed).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateReport, REQUIRED_FILES, type VitestReport } from './report';

const PROVIDER_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'];
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function main(): number {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-l06-'));
  const outFile = path.join(dir, 'report.json');
  const env = { ...process.env };
  for (const key of PROVIDER_KEYS) delete env[key];

  try {
    const child = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        ...REQUIRED_FILES,
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${outFile}`,
      ],
      { cwd: serverDir, env, stdio: 'inherit' },
    );

    let report: VitestReport | null = null;
    try {
      report = JSON.parse(readFileSync(outFile, 'utf8')) as VitestReport;
    } catch {
      console.error('verify:l06 FAILED - vitest wrote no readable report');
    }

    const verdict = evaluateReport(report);
    if (verdict.ok && child.status === 0) {
      console.log('verify:l06 OK - all required files ran and passed');
      return 0;
    }
    console.error('verify:l06 FAILED');
    for (const reason of verdict.reasons) console.error(`  - ${reason}`);
    if (verdict.ok) console.error(`  - vitest exited with status ${child.status}`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

process.exit(main());
