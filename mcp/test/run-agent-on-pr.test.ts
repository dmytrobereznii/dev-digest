import { describe, expect, it } from 'vitest';
import type { ApiReview, ApiRun } from '../src/api/schemas.js';
import { ReviewResultSchema } from '../src/tools/schemas.js';
import { connectTestServer, connectTestServerWithFetch } from './helpers/connect.js';
import { defaultRoutes, fakeFetch, SEEDED_PR, SEEDED_REPO, SEEDED_REVIEW, type Routes } from './helpers/fake-api.js';

const RUN_PATH = `/pulls/${SEEDED_PR.id}/runs`;
const REVIEW_START_PATH = `/pulls/${SEEDED_PR.id}/review`;
const REVIEWS_PATH = `/pulls/${SEEDED_PR.id}/reviews`;
const REFRESH_PATH = `/pulls/${SEEDED_PR.id}`;

const CALL_PARAMS = {
  name: 'run_agent_on_pr',
  arguments: { repo: 'acme/payments-api', pr_number: 482, agent: 'security' },
};

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content;
  return content?.[0]?.text ?? '';
}

function makeRun(overrides: Partial<ApiRun>): ApiRun {
  return {
    run_id: 'run-x',
    agent_id: 'agent-security',
    agent_name: 'Security Reviewer',
    status: 'running',
    error: null,
    ran_at: '2026-01-01T00:00:00.000Z',
    cost_usd: null,
    ...overrides,
  };
}

describe('T6 — run_agent_on_pr happy path', () => {
  it('refreshes the PR before the POST, follows running→done, selects the right review among ≥2, sorts findings, excludes+counts dismissed, sends increasing progress, and names detail=full', async () => {
    let refreshCalled = false;
    let pollCount = 0;
    const runId = 'run-new-482';

    const otherReview: ApiReview = {
      run_id: 'run-unrelated',
      agent_name: 'General Reviewer',
      kind: 'review',
      verdict: 'approve',
      summary: 'unrelated',
      score: 90,
      cost_usd: 0.001,
      created_at: '2026-01-01T00:00:00.000Z',
      findings: [],
    };
    const targetReview: ApiReview = {
      run_id: runId,
      agent_name: 'Security Reviewer',
      kind: 'review',
      verdict: 'request_changes',
      summary: 'target',
      score: 50,
      cost_usd: 0.02,
      created_at: '2026-01-01T00:00:00.000Z',
      findings: [
        {
          severity: 'CRITICAL',
          category: 'security',
          title: 'Dismissed one',
          file: 'z.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          suggestion: null,
          confidence: 0.99,
          dismissed_at: '2026-01-02T00:00:00.000Z',
        },
        {
          severity: 'WARNING',
          category: 'x',
          title: 'B',
          file: 'b.ts',
          start_line: 5,
          end_line: 5,
          rationale: 'r',
          suggestion: null,
          confidence: 0.5,
          dismissed_at: null,
        },
        {
          severity: 'WARNING',
          category: 'x',
          title: 'A',
          file: 'a.ts',
          start_line: 10,
          end_line: 10,
          rationale: 'r',
          suggestion: null,
          confidence: 0.5,
          dismissed_at: null,
        },
        {
          severity: 'CRITICAL',
          category: 'security',
          title: 'C',
          file: 'c.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          suggestion: null,
          confidence: 0.9,
          dismissed_at: null,
        },
      ],
    };

    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${REFRESH_PATH}`]: () => {
        refreshCalled = true;
        return { status: 200, body: SEEDED_PR };
      },
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: runId, agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: () => {
        pollCount++;
        const status = pollCount < 3 ? 'running' : 'done';
        return {
          status: 200,
          body: [makeRun({ run_id: runId, status, cost_usd: status === 'done' ? 0.02 : null })],
        };
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [otherReview, targetReview] },
    };

    const { client } = await connectTestServer(routes);
    const progressValues: number[] = [];
    const result = await client.callTool(CALL_PARAMS, undefined, {
      onprogress: (p) => progressValues.push(p.progress),
    });

    expect(refreshCalled).toBe(true);
    expect(result.isError).not.toBe(true);
    const output = ReviewResultSchema.parse(result.structuredContent);

    expect(output.run_id).toBe(runId);
    expect(output.status).toBe('done');
    expect(output.verdict).toBe('request_changes');
    expect(output.findings.map((f) => f.title)).toEqual(['C', 'A', 'B']);
    expect(output.dismissed).toBe(1);
    expect(output.next_step).toContain('detail=full');
    expect(output.next_step).toContain(runId);

    expect(progressValues.length).toBeGreaterThan(0);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThan(progressValues[i - 1]!);
    }
  });

  it('calls GET /repos/:id/pulls (sync), then the lookup, then GET /pulls/:id (refresh), then POST /pulls/:id/review, in that order', async () => {
    // D4/bug fix: the sync must run BEFORE the lookup — not only as a 404
    // fallback — because GET /pulls/:id (refresh) never updates `head_sha`;
    // only the list sync route does. `defaultRoutes()` finds the PR on the
    // very first lookup (no 404), so this also proves sync isn't skipped
    // just because the PR was already imported.
    const runId = 'run-order-482';
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: {
          pr_id: SEEDED_PR.id,
          runs: [{ run_id: runId, agent_id: 'agent-security', agent_name: 'Security Reviewer' }],
        },
      },
      [`GET ${RUN_PATH}`]: { status: 200, body: [makeRun({ run_id: runId, status: 'done', cost_usd: 0.01 })] },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: runId }] },
    };

    const { client, calls } = await connectTestServer(routes);
    await client.callTool(CALL_PARAMS);

    const syncIndex = calls.findIndex((c) => c.method === 'GET' && c.path === `/repos/${SEEDED_REPO.id}/pulls`);
    const lookupIndex = calls.findIndex(
      (c) => c.method === 'GET' && c.path === `/repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`,
    );
    const refreshIndex = calls.findIndex((c) => c.method === 'GET' && c.path === REFRESH_PATH);
    const postIndex = calls.findIndex((c) => c.method === 'POST' && c.path === REVIEW_START_PATH);

    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(lookupIndex).toBeGreaterThan(syncIndex);
    expect(refreshIndex).toBeGreaterThan(lookupIndex);
    expect(postIndex).toBeGreaterThan(refreshIndex);
  });
});

describe('T7 — run_agent_on_pr attach + single-flight', () => {
  it('attaches to the newest active run for the agent by ran_at, without a POST', async () => {
    let postCalls = 0;
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /pulls/${SEEDED_PR.id}/runs/active`]: {
        status: 200,
        body: [
          { run_id: 'run-old', agent_id: 'agent-security', ran_at: '2026-01-01T00:00:00.000Z' },
          { run_id: 'run-newest', agent_id: 'agent-security', ran_at: '2026-01-03T00:00:00.000Z' },
          { run_id: 'run-other-agent', agent_id: 'agent-general', ran_at: '2026-01-04T00:00:00.000Z' },
        ],
      },
      [`POST ${REVIEW_START_PATH}`]: () => {
        postCalls++;
        return { status: 200, body: { pr_id: SEEDED_PR.id, runs: [] } };
      },
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [makeRun({ run_id: 'run-newest', status: 'done', cost_usd: 0.01 })],
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: 'run-newest' }] },
    };

    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    const output = ReviewResultSchema.parse(result.structuredContent);

    expect(output.run_id).toBe('run-newest');
    expect(output.attached_to_existing_run).toBe(true);
    expect(postCalls).toBe(0);
  });

  it('two parallel identical calls share one POST', async () => {
    let postCalls = 0;
    let pollCount = 0;
    const runId = 'run-parallel';
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: () => {
        postCalls++;
        return {
          status: 200,
          body: { pr_id: SEEDED_PR.id, runs: [{ run_id: runId, agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
        };
      },
      [`GET ${RUN_PATH}`]: () => {
        pollCount++;
        const status = pollCount < 2 ? 'running' : 'done';
        return { status: 200, body: [makeRun({ run_id: runId, status, cost_usd: status === 'done' ? 0.01 : null })] };
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: runId }] },
    };

    const { client } = await connectTestServer(routes);
    const [r1, r2] = await Promise.all([client.callTool(CALL_PARAMS), client.callTool(CALL_PARAMS)]);

    expect(postCalls).toBe(1);
    const o1 = ReviewResultSchema.parse(r1.structuredContent);
    const o2 = ReviewResultSchema.parse(r2.structuredContent);
    expect(o1.run_id).toBe(runId);
    expect(o2.run_id).toBe(runId);
  });

  it('cancelling the FIRST of two joined calls does not end the SECOND: it still completes with its own progress (bug: single-flight used to share the whole poll loop, not just the start)', async () => {
    let postCalls = 0;
    let pollCount = 0;
    const runId = 'run-cancel-independent';
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: () => {
        postCalls++;
        return {
          status: 200,
          body: { pr_id: SEEDED_PR.id, runs: [{ run_id: runId, agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
        };
      },
      [`GET ${RUN_PATH}`]: () => {
        pollCount++;
        const status = pollCount < 6 ? 'running' : 'done';
        return { status: 200, body: [makeRun({ run_id: runId, status, cost_usd: status === 'done' ? 0.01 : null })] };
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: runId }] },
    };

    const { client } = await connectTestServer(routes, { pollIntervalMs: 5, maxWaitMs: 10000 });

    const controllerA = new AbortController();
    const bProgress: number[] = [];
    const aPromise = client.callTool(CALL_PARAMS, undefined, { signal: controllerA.signal });
    const bPromise = client.callTool(CALL_PARAMS, undefined, { onprogress: (p) => bProgress.push(p.progress) });

    // Let the shared start finish and at least one poll tick land for both
    // callers before cancelling A only.
    const deadline = Date.now() + 2000;
    while (pollCount < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(pollCount).toBeGreaterThanOrEqual(2);

    controllerA.abort();
    await expect(aPromise).rejects.toBeTruthy();

    const bResult = await bPromise;

    expect(postCalls).toBe(1); // the start was still shared
    expect(bResult.isError).not.toBe(true);
    const bOutput = ReviewResultSchema.parse(bResult.structuredContent);
    expect(bOutput.status).toBe('done');
    expect(bOutput.run_id).toBe(runId);

    // B got its OWN progress notifications, not none / not A's.
    expect(bProgress.length).toBeGreaterThan(0);
    for (let i = 1; i < bProgress.length; i++) {
      expect(bProgress[i]).toBeGreaterThan(bProgress[i - 1]!);
    }
  });
});

describe('T8 — run_agent_on_pr error paths', () => {
  it('E7: a disabled agent is refused before any POST', async () => {
    let postCalls = 0;
    const routes: Routes = {
      ...defaultRoutes(),
      'GET /agents': {
        status: 200,
        body: [{ id: 'agent-security', name: 'Security Reviewer', description: 'd', provider: 'openrouter', model: 'm', enabled: false }],
      },
      [`POST ${REVIEW_START_PATH}`]: () => {
        postCalls++;
        return { status: 200, body: { pr_id: SEEDED_PR.id, runs: [] } };
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('disabled');
    expect(postCalls).toBe(0);
  });

  it('E7 sanitizes a bidi/newline agent name before it reaches the result text (D13)', async () => {
    const dirtyName = 'Security‮Reviewer\nEvil';
    const routes: Routes = {
      ...defaultRoutes(),
      'GET /agents': {
        status: 200,
        body: [{ id: 'agent-security', name: dirtyName, description: 'd', provider: 'openrouter', model: 'm', enabled: false }],
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    const out = text(result);
    expect(out).toContain('disabled');
    expect(out).not.toContain('‮');
    expect(out).not.toContain('\n');
  });

  it('E11 on a 429 from the POST', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 429,
        body: { error: { code: 'internal_error', message: 'Rate limit exceeded, retry in 1 minute' } },
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("review rate limit");
  });

  it('E12 names the missing key and /settings/api-keys', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-e12', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [makeRun({ run_id: 'run-e12', status: 'failed', error: 'OPENROUTER_API_KEY is not configured' })],
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('OPENROUTER_API_KEY');
    expect(text(result)).toContain('/settings/api-keys');
  });

  it('E13 with a null error', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-e13', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [makeRun({ run_id: 'run-e13', status: 'failed', error: null })],
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('no message; the API may have restarted mid-run');
  });

  it('E14 on a cancelled run', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-e14', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [makeRun({ run_id: 'run-e14', status: 'cancelled' })],
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('cancelled');
  });

  it('a 404 while polling maps to E10 immediately', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-404', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: { status: 404, body: { error: { code: 'not_found', message: 'gone' } } },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('DevDigest API error 404');
  });

  it('E4: still not found for the PR after the one sync retry, naming a token setting', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'nope' } },
      },
      // The one sync-and-retry still finds nothing.
      [`GET /repos/${SEEDED_REPO.id}/pulls`]: { status: 200, body: [] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(`PR #${SEEDED_PR.number} not found for acme/payments-api`);
    expect(text(result)).toContain('/settings/api-keys');
  });
});

describe('run_agent_on_pr — cancellation (extra.signal)', () => {
  it('a client-side abort stops polling, and the run is never cancelled (no cancel-shaped call)', async () => {
    let pollCount = 0;
    const runId = 'run-abort';
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: {
          pr_id: SEEDED_PR.id,
          runs: [{ run_id: runId, agent_id: 'agent-security', agent_name: 'Security Reviewer' }],
        },
      },
      [`GET ${RUN_PATH}`]: () => {
        pollCount++;
        return { status: 200, body: [makeRun({ run_id: runId, status: 'running' })] };
      },
    };
    const { client, calls } = await connectTestServer(routes, { pollIntervalMs: 5, maxWaitMs: 10000 });

    const controller = new AbortController();
    const callPromise = client.callTool(CALL_PARAMS, undefined, { signal: controller.signal });

    // Wait for at least one real poll tick before cancelling, so this
    // exercises mid-flight cancellation rather than a cancel-before-start race.
    const deadline = Date.now() + 2000;
    while (pollCount < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(pollCount).toBeGreaterThanOrEqual(1);

    controller.abort();
    await expect(callPromise).rejects.toBeTruthy();

    // Give the server-side `notifications/cancelled` time to land and the
    // poll loop's `extra.signal.aborted` check time to stop it.
    const countAtAbort = pollCount;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pollCount).toBe(countAtAbort);

    // No DELETE, and no path naming a cancel operation, was ever called.
    expect(calls.some((c) => c.method === 'DELETE' || c.path.includes('cancel'))).toBe(false);
  });
});

describe('T9 — run_agent_on_pr timeout, unknown status, and E15', () => {
  it('hitting maxWaitMs returns a non-error running result naming get_findings and the run_id', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-timeout', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: { status: 200, body: [makeRun({ run_id: 'run-timeout', status: 'running' })] },
    };
    const { client } = await connectTestServer(routes, { maxWaitMs: 20, pollIntervalMs: 5 });
    const result = await client.callTool(CALL_PARAMS);

    expect(result.isError).not.toBe(true);
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.status).toBe('running');
    expect(output.next_step).toContain('get_findings');
    expect(output.next_step).toContain('run-timeout');
  });

  it('a null or unrecognized status keeps polling until done', async () => {
    let pollCount = 0;
    const routes: Routes = {
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-null', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
      [`GET ${RUN_PATH}`]: () => {
        pollCount++;
        const status = pollCount === 1 ? null : pollCount === 2 ? 'queued' : 'done';
        return {
          status: 200,
          body: [makeRun({ run_id: 'run-null', status, cost_usd: status === 'done' ? 0.01 : null })],
        };
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: 'run-null' }] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(CALL_PARAMS);
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.status).toBe('done');
    expect(pollCount).toBeGreaterThanOrEqual(3);
  });

  it('5 consecutive polling faults (mixed network/5xx/429) → E15 naming repo, pr_number and run_id', async () => {
    const { fetch: baseFetch } = fakeFetch({
      ...defaultRoutes(),
      [`POST ${REVIEW_START_PATH}`]: {
        status: 200,
        body: { pr_id: SEEDED_PR.id, runs: [{ run_id: 'run-faulty', agent_id: 'agent-security', agent_name: 'Security Reviewer' }] },
      },
    });

    let attempt = 0;
    const faultyFetch: typeof fetch = async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.pathname === RUN_PATH) {
        attempt++;
        const statusByAttempt: Record<number, number> = { 1: 429, 3: 500, 4: 503, 5: 429 };
        if (attempt === 2) {
          throw new Error('network blip');
        }
        const httpStatus = statusByAttempt[attempt];
        if (httpStatus) {
          return new Response(JSON.stringify({ error: { code: 'internal_error', message: 'boom' } }), {
            status: httpStatus,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return baseFetch(input, init);
    };

    const { client } = await connectTestServerWithFetch(faultyFetch, { pollIntervalMs: 1, maxWaitMs: 5000 });
    const result = await client.callTool(CALL_PARAMS);

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('acme/payments-api#482');
    expect(text(result)).toContain('run-faulty');
    expect(attempt).toBe(5);
  });
});
