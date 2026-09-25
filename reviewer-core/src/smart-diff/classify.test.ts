import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

// Path -> role table for classifyFile (spec 08 §4, rules D2). First match
// wins, checked in this order: boilerplate, tests, wiring, docs, core.
const CASES: Array<[path: string, role: SmartDiffRole]> = [
  // --- the 3 required rows (D2) ---
  // boilerplate (rule 1) is checked before tests (rule 2), so the
  // __snapshots__/*.snap match wins even though the path also sits inside a
  // __tests__/ directory.
  ['__tests__/__snapshots__/x.snap', 'boilerplate'],
  // wiring's ^\.claude/ rule (3) is checked before docs' *.md rule (4).
  ['.claude/skills/security/SKILL.md', 'wiring'],
  // D2 decision, kept on purpose: a README inside a test tree ships with the
  // tests, so the e2e/ directory rule (tests, rule 2) wins over the docs
  // README* rule (4).
  ['e2e/README.md', 'tests'],

  // --- every lock name -> boilerplate ---
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['poetry.lock', 'boilerplate'],
  ['Gemfile.lock', 'boilerplate'],
  ['composer.lock', 'boilerplate'],
  ['pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['npm-shrinkwrap.json', 'boilerplate'],
  ['bun.lockb', 'boilerplate'],

  // --- dist/build at any depth -> boilerplate ---
  ['dist/index.js', 'boilerplate'],
  ['packages/api/build/output.js', 'boilerplate'],

  // --- snapshots -> boilerplate ---
  ['src/components/__snapshots__/Foo.test.tsx.snap', 'boilerplate'],

  // --- tests ---
  ['server/test/foo.it.test.ts', 'tests'], // *.it.test.ts is covered by the *.test.* pattern
  ['src/foo.spec.ts', 'tests'],
  ['src/__tests__/helpers.ts', 'tests'], // dir-based match; the file itself matches no test/spec pattern

  // --- barrels: index.ts is wiring, index.tsx is core (a component here) ---
  ['src/components/index.ts', 'wiring'],
  ['src/components/index.tsx', 'core'],

  // --- wiring / config-ish files ---
  ['vite.config.ts', 'wiring'],
  ['src/config.ts', 'wiring'], // D2 deviation from the brief
  ['tsconfig.base.json', 'wiring'],
  ['.env.example', 'wiring'],
  ['.github/workflows/x.yml', 'wiring'],
  ['package.json', 'wiring'], // D2 deviation: not boilerplate, so a new dependency can't hide in a collapsed group

  // --- docs ---
  ['docs/a.ts', 'docs'], // the docs/ directory rule wins even for a non-doc extension
  ['readme.txt', 'docs'], // README* name pattern is case-insensitive, independent of extension

  // --- false positives: must stay core ---
  ['src/latest/x.ts', 'core'], // "latest/" contains "test/" as a substring but is not the tests path segment
  ['src/testing.ts', 'core'], // "testing.ts" is not *.test.* and not a tests/ directory segment

  // --- normalization: a Windows-style backslash path still classifies ---
  ['src\\a.test.ts', 'tests'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

describe('ROLE_ORDER', () => {
  it('equals SmartDiffRole.options (D3: the enum order is the display order)', () => {
    expect(ROLE_ORDER).toEqual(SmartDiffRole.options);
  });
});
