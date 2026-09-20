import { describe, it, expect } from 'vitest';
import { isBodyChange, parseSkillMarkdown, restoreNote } from './helpers.js';
import { FALLBACK_SKILL_NAME } from './constants.js';
import type { SkillRow } from './repository.js';

/**
 * Pure helpers — no DB. Covers the two rules the rest of the module leans on:
 * metadata derived from a body (the create form's name field is optional), and
 * "only a body change versions a skill".
 */

describe('parseSkillMarkdown', () => {
  it('derives the name from the first # H1 and the description from the paragraph under it', () => {
    const parsed = parseSkillMarkdown(
      [
        '# PR Quality Rubric',
        '',
        'Score each change on scope, tests and blast radius',
        'before writing a single finding.',
        '',
        '## Scope',
        'Ignore this paragraph.',
      ].join('\n'),
    );
    expect(parsed.name).toBe('PR Quality Rubric');
    expect(parsed.description).toBe(
      'Score each change on scope, tests and blast radius before writing a single finding.',
    );
  });

  it('stops at the next heading when the H1 is followed immediately by one', () => {
    const parsed = parseSkillMarkdown('# Secret Leakage Gate\n## Rules\nNo tokens in fixtures.');
    expect(parsed.name).toBe('Secret Leakage Gate');
    expect(parsed.description).toBe('');
  });

  it('falls back when the body has no H1 at all', () => {
    // `##` is not an H1, and neither is a `#tag` with no space.
    const parsed = parseSkillMarkdown('## Not a title\n\n#tag\n\nSome prose.');
    expect(parsed.name).toBe(FALLBACK_SKILL_NAME);
    expect(parsed.description).toBe('');
  });
});

describe('isBodyChange', () => {
  const existing = { body: 'Always check the tests.' } as Pick<SkillRow, 'body'>;

  it('is true only when the patch carries a DIFFERENT body', () => {
    expect(isBodyChange(existing, { body: 'Always check the tests, twice.' })).toBe(true);
    expect(isBodyChange(existing, { body: existing.body })).toBe(false);
    expect(isBodyChange(existing, {})).toBe(false);
  });
});

describe('restoreNote', () => {
  it('names the version it restored from (D8)', () => {
    expect(restoreNote(1)).toBe('Restored from v1');
  });
});
