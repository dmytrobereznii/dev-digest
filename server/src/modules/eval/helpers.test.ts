import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { caseNameFromTitle, expectationFromFinding, fragmentForFile } from './helpers.js';

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

describe('eval helpers', () => {
  it('caseNameFromTitle lowercases and kebab-cases a title', () => {
    expect(caseNameFromTitle('Hardcoded Stripe secret key')).toBe('hardcoded-stripe-secret-key');
    expect(caseNameFromTitle('  SQL injection in `getUser()` (v2)!  ')).toBe('sql-injection-in-getuser-v2');
  });

  it('caseNameFromTitle returns a non-empty name for a title with no letter or digit', () => {
    for (const title of ['!!!', '---', '   ', '', '日本語']) {
      const name = caseNameFromTitle(title);
      expect(name.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('expectationFromFinding gives must_find for accepted and must_not_flag for dismissed, with file, lines, title, severity and category', () => {
    const f = {
      file: 'src/config.ts',
      startLine: 11,
      endLine: 13,
      title: 'Hardcoded Stripe secret key',
      severity: 'CRITICAL',
      category: 'security',
    };
    const base = {
      file: 'src/config.ts',
      start_line: 11,
      end_line: 13,
      title: 'Hardcoded Stripe secret key',
      severity: 'CRITICAL',
      category: 'security',
    };
    expect(expectationFromFinding(f, 'accepted')).toEqual({ type: 'must_find', ...base });
    expect(expectationFromFinding(f, 'dismissed')).toEqual({ type: 'must_not_flag', ...base });
  });

  it('fragmentForFile puts --- a/<path> and +++ b/<path> before the patch', () => {
    expect(fragmentForFile('src/config.ts', PATCH)).toBe(`--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`);
  });

  it("a fragment parses to one file whose new-side lines are the patch's", () => {
    const diff = parseUnifiedDiff(fragmentForFile('src/config.ts', PATCH));
    expect(diff.files).toHaveLength(1);
    const file = diff.files[0]!;
    expect(file.path).toBe('src/config.ts');
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]!.newLineNumbers).toEqual(
      parseUnifiedDiff(`diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`)
        .files[0]!.hunks[0]!.newLineNumbers,
    );
    expect(file.hunks[0]!.newLineNumbers).toContain(11);
  });
});
