import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const cfg = (extra: Record<string, string> = {}) =>
  loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...extra } as NodeJS.ProcessEnv);

describe('API_RATE_LIMIT_MAX', () => {
  it('defaults to 120, is overridable, and an empty value falls back to the default', () => {
    expect(cfg().rateLimitMax).toBe(120);
    expect(cfg({ API_RATE_LIMIT_MAX: '' }).rateLimitMax).toBe(120);
    expect(cfg({ API_RATE_LIMIT_MAX: '10000' }).rateLimitMax).toBe(10000);
  });
});
