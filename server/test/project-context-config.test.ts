import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const base = { NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv;

describe('project context config', () => {
  it('pattern defaults to **/{specs,docs,insights}/**/*.md and budget to 8000, both overridable', () => {
    const dflt = loadConfig(base);
    expect(dflt.projectContextPattern).toBe('**/{specs,docs,insights}/**/*.md');
    expect(dflt.projectContextBudget).toBe(8000);

    // .env.example ships both keys empty: that must still mean "default".
    const empty = loadConfig({ ...base, PROJECT_CONTEXT_GLOB: '', PROJECT_CONTEXT_BUDGET_TOKENS: '' });
    expect(empty.projectContextPattern).toBe('**/{specs,docs,insights}/**/*.md');
    expect(empty.projectContextBudget).toBe(8000);

    const custom = loadConfig({
      ...base,
      PROJECT_CONTEXT_GLOB: 'notes/**/*.md',
      PROJECT_CONTEXT_BUDGET_TOKENS: '1234',
    });
    expect(custom.projectContextPattern).toBe('notes/**/*.md');
    expect(custom.projectContextBudget).toBe(1234);
  });
});
