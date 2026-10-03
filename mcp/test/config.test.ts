import { describe, expect, it } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { loadConfig } from '../src/config.js';
import { ApiUnavailableError, ConfigError } from '../src/errors.js';

const ACCEPTED_API_URLS = [
  'http://127.0.0.1:3001',
  'http://[::1]:3001',
  'http://localhost:3001/',
];

const REJECTED_API_URLS = [
  'http://10.0.0.5:3001',
  'ftp://127.0.0.1',
  'http://127.0.0.1@evil.com',
  'http://[::ffff:127.0.0.1]:3001',
  'http://localhost.evil.com',
  'http://127.0.0.1:3001/api',
  'http://127.0.0.1:3001?x=1',
  'http://127.0.0.1:3001#frag',
];

describe('loadConfig — DEVDIGEST_API_URL (D12)', () => {
  it.each(ACCEPTED_API_URLS)('accepts %s', (raw) => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: raw })).not.toThrow();
  });

  it.each(REJECTED_API_URLS)('rejects %s', (raw) => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: raw })).toThrow(ConfigError);
  });
});

describe('loadConfig — DEVDIGEST_MCP_MAX_WAIT_S clamp (D7)', () => {
  it('clamps below the floor to 30s', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '10' }).maxWaitMs).toBe(30_000);
  });

  it('clamps above the ceiling to 1800s', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '5000' }).maxWaitMs).toBe(1_800_000);
  });

  it('defaults to 900s when unset', () => {
    expect(loadConfig({}).maxWaitMs).toBe(900_000);
  });

  it('defaults to 900s on an empty string, rather than clamping Number("") === 0 to the 30s floor', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '' }).maxWaitMs).toBe(900_000);
  });

  it('defaults to 900s on a whitespace-only string', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '   ' }).maxWaitMs).toBe(900_000);
  });
});

describe('a fetch that refuses a redirect (redirect: "error")', () => {
  it('surfaces as ApiUnavailableError with no retry', async () => {
    const config = loadConfig({});
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      // Mirrors what undici's fetch throws when `redirect: 'error'` meets a
      // 30x response: a TypeError, not an HTTP response to parse.
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    const api = new DevDigestApi(config, fetchImpl);
    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiUnavailableError);
    expect(calls).toBe(1);
  });
});
