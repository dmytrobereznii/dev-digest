import { describe, it, expect } from 'vitest';
import { documentType, planInjection, skillSpecPaths } from './helpers.js';

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

describe('planInjection', () => {
  const tokens = (m: Record<string, number>) => (p: string) => m[p] ?? null;

  it('planInjection orders agent documents first, then each skill in link order', () => {
    const plan = planInjection(
      [
        { path: 'a1.md', source: 'agent' },
        { path: 'a2.md', source: 'agent' },
        { path: 's1.md', source: 'skill-1' },
        { path: 's1b.md', source: 'skill-1' },
        { path: 's2.md', source: 'skill-2' },
      ],
      ['s2.md', 's1b.md', 's1.md', 'a2.md', 'a1.md'],
      () => 1,
      100,
    );
    expect(plan.injected.map((d) => d.path)).toEqual(['a1.md', 'a2.md', 's1.md', 's1b.md', 's2.md']);
    expect(plan.skipped).toEqual([]);
  });

  it('planInjection keeps the first occurrence of a repeated path', () => {
    const plan = planInjection(
      [
        { path: 'x.md', source: 'agent' },
        { path: 'y.md', source: 'agent' },
        { path: 'y.md', source: 'skill-1' },
        { path: 'x.md', source: 'skill-1' },
      ],
      ['x.md', 'y.md'],
      () => 5,
      100,
    );
    expect(plan.injected.map((d) => d.path)).toEqual(['x.md', 'y.md']);
    expect(plan.skipped).toEqual([]);
  });

  it('planInjection skips an unlisted path as missing', () => {
    const plan = planInjection(
      [
        { path: 'gone.md', source: 'agent' },
        { path: 'here.md', source: 'agent' },
      ],
      ['here.md'],
      tokens({ 'gone.md': 3, 'here.md': 3 }),
      100,
    );
    expect(plan.skipped).toEqual([{ path: 'gone.md', reason: 'missing' }]);
    expect(plan.injected.map((d) => d.path)).toEqual(['here.md']);
  });

  it('planInjection skips the first overflow and every later document as over_budget', () => {
    const plan = planInjection(
      [
        { path: 'a.md', source: 'agent' },
        { path: 'big.md', source: 'agent' },
        { path: 'small.md', source: 'agent' },
      ],
      ['a.md', 'big.md', 'small.md'],
      tokens({ 'a.md': 6, 'big.md': 5, 'small.md': 1 }),
      10,
    );
    // a fits (6); big would take the sum to 11 > 10; small would fit alone but is later
    expect(plan.injected).toEqual([{ path: 'a.md', tokens: 6, sources: ['agent'] }]);
    expect(plan.skipped).toEqual([
      { path: 'big.md', reason: 'over_budget' },
      { path: 'small.md', reason: 'over_budget' },
    ]);
  });

  it('planInjection injects a document that lands exactly on the budget', () => {
    const plan = planInjection([{ path: 'a.md', source: 'agent' }], ['a.md'], () => 10, 10);
    expect(plan.injected.map((d) => d.path)).toEqual(['a.md']);
  });
});

describe('skillSpecPaths', () => {
  it('skillSpecPaths lists only injected documents attached to that skill', () => {
    const plan = planInjection(
      [
        { path: 'agent.md', source: 'agent' },
        { path: 's1.md', source: 'skill-1' },
        { path: 'shared.md', source: 'skill-1' },
        { path: 'shared.md', source: 'skill-2' },
        { path: 'unlisted.md', source: 'skill-1' },
        { path: 's2.md', source: 'skill-2' },
      ],
      ['agent.md', 's1.md', 'shared.md', 's2.md'],
      () => 1,
      100,
    );
    expect(skillSpecPaths(plan, 'skill-1')).toEqual(['s1.md', 'shared.md']);
    expect(skillSpecPaths(plan, 'skill-2')).toEqual(['shared.md', 's2.md']);
    expect(skillSpecPaths(plan, 'skill-3')).toEqual([]);
  });
});
