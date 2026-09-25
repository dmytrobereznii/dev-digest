import { describe, expect, it } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { loadConfig } from '../src/config.js';
import { ApiHttpError, ApiUnavailableError, ContractMismatchError } from '../src/errors.js';
import * as messages from '../src/messages.js';
import { defaultRoutes, fakeFetch } from './helpers/fake-api.js';

const config = () => loadConfig({});

describe('DevDigestApi — the §5.1 method surface', () => {
  it('exposes exactly the named methods, no generic request()', () => {
    const methods = Object.getOwnPropertyNames(DevDigestApi.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(methods.sort()).toEqual(
      [
        'listAgents',
        'listRepos',
        'getPullByNumber',
        'syncPulls',
        'refreshPull',
        'startReview',
        'activeRuns',
        'listRuns',
        'listReviews',
        'getConventions',
      ].sort(),
    );
  });

  it('every call carries redirect: "error"', async () => {
    const { fetch: fetchImpl, calls } = fakeFetch(defaultRoutes());
    const api = new DevDigestApi(config(), fetchImpl);
    await api.listAgents();
    await api.listRepos();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.init?.redirect).toBe('error');
    }
  });
});

describe('DevDigestApi — error classification', () => {
  it('an error envelope on a non-2xx status maps to ApiHttpError', async () => {
    const routes = {
      'GET /repos': { status: 422, body: { error: { code: 'validation_error', message: 'bad id' } } },
    };
    const api = new DevDigestApi(config(), fakeFetch(routes).fetch);

    let caught: unknown;
    try {
      await api.listRepos();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiHttpError);
    const e = caught as ApiHttpError;
    expect(e.status).toBe(422);
    expect(e.code).toBe('validation_error');
    expect(e.message).toBe('bad id');
  });

  it('a 500 envelope maps to E10 via messages.e10', async () => {
    const routes = {
      'GET /agents': { status: 500, body: { error: { code: 'internal_error', message: 'boom' } } },
    };
    const api = new DevDigestApi(config(), fakeFetch(routes).fetch);

    let caught: unknown;
    try {
      await api.listAgents();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiHttpError);
    const e = caught as ApiHttpError;
    expect(messages.e10(e.status, e.code, e.message)).toBe(
      'DevDigest API error 500 internal_error: boom. Do not retry with the same arguments; tell the user.',
    );
  });

  it('classification ignores the envelope code: a 429 is classified by status alone', async () => {
    // The rate-limit body reuses the generic `internal_error` code
    // (server INSIGHTS 2026-09-20) — the client must not read it as meaningful.
    const routes = {
      'POST /pulls/pr-482/review': {
        status: 429,
        body: { error: { code: 'internal_error', message: 'Rate limit exceeded, retry in 1 minute' } },
      },
    };
    const api = new DevDigestApi(config(), fakeFetch(routes).fetch);

    let caught: unknown;
    try {
      await api.startReview('pr-482', 'agent-security');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiHttpError);
    expect((caught as ApiHttpError).status).toBe(429);
  });

  it('a malformed 200 body is a contract mismatch mapped to E9 (well-formed JSON, wrong shape)', async () => {
    const routes = { 'GET /agents': { status: 200, body: [{ id: 'a1' }] } };
    const api = new DevDigestApi(config(), fakeFetch(routes).fetch);

    let caught: unknown;
    try {
      await api.listAgents();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContractMismatchError);
    const e = caught as ContractMismatchError;
    expect(e.method).toBe('GET');
    expect(e.path).toBe('/agents');
    expect(messages.e9(e.method, e.path)).toBe(
      'DevDigest returned an unexpected response for GET /agents; this is a DevDigest bug, not your input. Do not retry; tell the user.',
    );
  });

  it('a body-read failure on a 2xx response is transient (ApiUnavailableError), not a contract mismatch', async () => {
    // `res.json()` rejecting on an otherwise-OK response is what an abort,
    // a timeout, or a socket drop mid-read looks like — never actually
    // malformed JSON the server sent on purpose, so it must be classified
    // as transient (retry-worthy for polling), unlike the well-formed-but-
    // wrong-shape case above.
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new Error('terminated');
        },
      }) as unknown as Response) as typeof fetch;
    const api = new DevDigestApi(config(), fetchImpl);

    let caught: unknown;
    try {
      await api.listAgents();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiUnavailableError);
    expect(caught).not.toBeInstanceOf(ContractMismatchError);
  });

  it('a connection failure (ECONNREFUSED) surfaces as ApiUnavailableError', async () => {
    const fetchImpl = (async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3001') as NodeJS.ErrnoException;
      err.code = 'ECONNREFUSED';
      throw err;
    }) as typeof fetch;
    const api = new DevDigestApi(config(), fetchImpl);

    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
