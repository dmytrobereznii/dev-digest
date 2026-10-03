import { describe, it, expect } from 'vitest';
import { documentType } from './helpers.js';

describe('project-context helpers', () => {
  it('documentType is the nearest specs, docs or insights directory, else other', () => {
    expect(documentType('specs/a.md')).toBe('specs');
    expect(documentType('server/docs/a.md')).toBe('docs');
    expect(documentType('.context/insights/a.md')).toBe('insights');
    // nearest wins, in either nesting order
    expect(documentType('docs/specs/a.md')).toBe('specs');
    expect(documentType('specs/docs/a.md')).toBe('docs');
    expect(documentType('insights/deep/specs/x/y.md')).toBe('specs');
    // the file name itself is not a directory
    expect(documentType('notes/specs.md')).toBe('other');
    expect(documentType('README.md')).toBe('other');
    expect(documentType('src/readme.md')).toBe('other');
  });
});
