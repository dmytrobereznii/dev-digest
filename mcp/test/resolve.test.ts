import { describe, expect, it } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { loadConfig } from '../src/config.js';
import { ContractMismatchError, ToolError } from '../src/errors.js';
import * as messages from '../src/messages.js';
import { resolveAgent, resolvePr, resolveRepo, type ResolveDeps } from '../src/resolve.js';
import { SEEDED_AGENTS, SEEDED_PR, SEEDED_REPO, defaultRoutes, fakeFetch, type Routes } from './helpers/fake-api.js';

function makeDeps(routes: Routes = defaultRoutes()) {
  const { fetch: fetchImpl, calls } = fakeFetch(routes);
  const config = loadConfig({});
  const api = new DevDigestApi(config, fetchImpl);
  const deps: ResolveDeps = { api, config };
  return { deps, calls };
}

describe('resolveRepo', () => {
  it('normalizes a github URL, .git suffix, trailing slash and case', async () => {
    const { deps } = makeDeps();
    const inputs = [
      'acme/payments-api',
      'https://github.com/acme/payments-api',
      'acme/payments-api.git',
      'acme/payments-api/',
      'ACME/Payments-API',
    ];
    for (const input of inputs) {
      const repo = await resolveRepo(deps, input);
      expect(repo.full_name).toBe(SEEDED_REPO.full_name);
    }
  });

  it('rejects a PR URL with the pull-URL hint (E1)', async () => {
    const { deps } = makeDeps();
    await expect(
      resolveRepo(deps, 'https://github.com/acme/payments-api/pull/482'),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'For a PR URL, pass repo=owner/name and pr_number separately.',
      ),
    });
  });

  it('rejects a bad shape with E1 and no hint', async () => {
    const { deps } = makeDeps();
    await expect(resolveRepo(deps, 'not-a-repo')).rejects.toBeInstanceOf(ToolError);
    await expect(resolveRepo(deps, 'not-a-repo')).rejects.toMatchObject({
      message: messages.e1('not-a-repo'),
    });
  });

  it('E2 lists known repos', async () => {
    const { deps } = makeDeps();
    await expect(resolveRepo(deps, 'nope/nope')).rejects.toMatchObject({
      message: messages.e2('nope/nope', [SEEDED_REPO.full_name], deps.config.webUrl),
    });
  });
});

describe('resolveAgent', () => {
  it('matches by id', async () => {
    const { deps } = makeDeps();
    const first = SEEDED_AGENTS[0]!;
    const agent = await resolveAgent(deps, first.id);
    expect(agent.id).toBe(first.id);
  });

  it('matches by case-insensitive exact name', async () => {
    const { deps } = makeDeps();
    const agent = await resolveAgent(deps, 'security reviewer');
    expect(agent.name).toBe('Security Reviewer');
  });

  it('matches a unique case-insensitive substring', async () => {
    const { deps } = makeDeps();
    const agent = await resolveAgent(deps, 'security');
    expect(agent.name).toBe('Security Reviewer');
  });

  it('E5 names list_agents for no match', async () => {
    const { deps } = makeDeps();
    await expect(resolveAgent(deps, 'nope')).rejects.toMatchObject({
      message: messages.e5('nope'),
    });
  });

  it('E6 on "reviewer" — ambiguous over all 5 seeded agents', async () => {
    const { deps } = makeDeps();
    let caught: unknown;
    try {
      await resolveAgent(deps, 'reviewer');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ToolError);
    const message = (caught as ToolError).message;
    expect(message).toContain('matches several agents');
    for (const agent of SEEDED_AGENTS) {
      expect(message).toContain(agent.name);
    }
  });
});

describe('resolvePr', () => {
  it('sync: true ALWAYS calls GET /repos/:id/pulls exactly once, BEFORE the lookup — even when the PR is already found (bug: a stale head_sha when the sync only fired on a 404)', async () => {
    // `defaultRoutes()` already resolves the lookup with a 200 on the FIRST
    // attempt (no 404) — under the old "sync only as a 404 fallback"
    // behaviour, `syncCalls` below would be empty and `syncIndex` would be
    // -1, because the sync route was never reached at all.
    const { deps, calls } = makeDeps();

    const pr = await resolvePr(deps, SEEDED_REPO, SEEDED_PR.number, { sync: true });
    expect(pr.number).toBe(SEEDED_PR.number);

    const syncCalls = calls.filter((c) => c.method === 'GET' && c.path === `/repos/${SEEDED_REPO.id}/pulls`);
    expect(syncCalls).toHaveLength(1);

    const syncIndex = calls.findIndex((c) => c.method === 'GET' && c.path === `/repos/${SEEDED_REPO.id}/pulls`);
    const lookupIndex = calls.findIndex(
      (c) => c.method === 'GET' && c.path === `/repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`,
    );
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(lookupIndex).toBeGreaterThan(syncIndex);
  });

  it('still not found after the sync → E4', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/999`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'nope' } },
      },
    };
    const { deps } = makeDeps(routes);

    await expect(resolvePr(deps, SEEDED_REPO, 999, { sync: true })).rejects.toMatchObject({
      message: messages.e4(999, SEEDED_REPO.full_name, deps.config.webUrl),
    });
  });

  it('a read tool (sync: false) never calls the sync route and gets E3', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/999`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'nope' } },
      },
    };
    const { deps, calls } = makeDeps(routes);

    await expect(resolvePr(deps, SEEDED_REPO, 999, { sync: false })).rejects.toMatchObject({
      message: messages.e3(999, SEEDED_REPO.full_name),
    });
    expect(calls.some((c) => c.path === `/repos/${SEEDED_REPO.id}/pulls`)).toBe(false);
  });

  it('a null PR id is a contract mismatch (E9)', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`]: {
        status: 200,
        body: { ...SEEDED_PR, id: null },
      },
    };
    const { deps } = makeDeps(routes);

    let caught: unknown;
    try {
      await resolvePr(deps, SEEDED_REPO, SEEDED_PR.number, { sync: false });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContractMismatchError);
    const e = caught as ContractMismatchError;
    expect(messages.e9(e.method, e.path)).toBe(
      messages.e9('GET', `/repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`),
    );
  });
});
