/**
 * Test-only `fetch` stub + seed-shaped fixtures (spec §8): 5 agents (the
 * seeded set — see server INSIGHTS 2026-09-25), #482's review on
 * `acme/payments-api`, and its 3 pending conventions. `fakeFetch(routes)`
 * maps `"METHOD path"` to a response and records every call (with its
 * `init`), so a test can assert on `redirect`, on how many times a route was
 * hit, or swap a route mid-test via a function value.
 */
import type {
  ApiActiveRun,
  ApiAgent,
  ApiConventionsPage,
  ApiPr,
  ApiRepo,
  ApiReview,
  ApiRun,
} from '../../src/api/schemas.js';

export interface RouteResponse {
  status: number;
  body: unknown;
}

export type RouteHandler = RouteResponse | ((init: RequestInit | undefined) => RouteResponse);

export type Routes = Record<string, RouteHandler>;

export interface RecordedCall {
  method: string;
  path: string;
  init: RequestInit | undefined;
}

/** Builds a `fetch`-compatible stub over `routes`, keyed `"METHOD /path"`
 * (pathname only — query strings are never used by `DevDigestApi`). An
 * unmapped route 404s with a structured envelope rather than throwing, so a
 * test that forgets a route sees a clean `ApiHttpError` instead of a crash. */
export function fakeFetch(routes: Routes): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    calls.push({ method, path: url.pathname, init });

    const handler = routes[key];
    const resolved: RouteResponse = handler
      ? typeof handler === 'function'
        ? handler(init)
        : handler
      : { status: 404, body: { error: { code: 'not_found', message: `no fake route for ${key}` } } };

    return new Response(JSON.stringify(resolved.body), {
      status: resolved.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

// ---- Seeded fixtures (server/src/db/seed.ts, seed-skills.ts, seed-conventions.ts) ----

export const SEEDED_REPO: ApiRepo = {
  id: 'repo-acme-payments-api',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
};

export const SEEDED_AGENTS: ApiAgent[] = [
  {
    id: 'agent-general',
    name: 'General Reviewer',
    description: 'General-purpose PR review.',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    enabled: true,
  },
  {
    id: 'agent-security',
    name: 'Security Reviewer',
    description: 'Security-focused PR review.',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    enabled: true,
  },
  {
    id: 'agent-performance',
    name: 'Performance Reviewer',
    description: 'Performance-focused PR review.',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    enabled: true,
  },
  {
    id: 'agent-test-quality',
    name: 'Test Quality Reviewer',
    description: 'Flags uncovered branches, missed edge cases, over-mocking and flaky patterns.',
    provider: 'openrouter',
    model: 'anthropic/claude-haiku-4.5',
    enabled: true,
  },
  {
    id: 'agent-api-contract',
    name: 'API Contract Reviewer',
    description:
      'Flags breaking changes to a route signature, request/response shape, or status codes.',
    provider: 'openrouter',
    model: 'anthropic/claude-haiku-4.5',
    enabled: true,
  },
];

export const SEEDED_PR: ApiPr = {
  id: 'pr-482',
  number: 482,
  title: 'Add rate limiting to public API endpoints',
  head_sha: 'a1b2c3d4e5f6',
};

export const SEEDED_RUN_ID = 'run-482-security';

export const SEEDED_REVIEW: ApiReview = {
  run_id: SEEDED_RUN_ID,
  agent_name: 'Security Reviewer',
  kind: 'review',
  verdict: 'request_changes',
  summary:
    'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
  score: 61,
  cost_usd: 0.014,
  created_at: '2026-01-01T00:00:00.000Z',
  findings: [
    {
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key in commit',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
      suggestion: 'Move to env var and rotate the key immediately.',
      confidence: 0.98,
      dismissed_at: null,
    },
    {
      severity: 'WARNING',
      category: 'perf',
      title: 'N+1 query in user list endpoint',
      file: 'src/api/users.ts',
      start_line: 45,
      end_line: 52,
      rationale: 'Loop issues one query per user → N+1.',
      suggestion: 'Use a single IN query and group in memory.',
      confidence: 0.86,
      dismissed_at: null,
    },
  ],
};

export const SEEDED_RUN: ApiRun = {
  run_id: SEEDED_RUN_ID,
  agent_id: 'agent-security',
  agent_name: 'Security Reviewer',
  status: 'done',
  error: null,
  ran_at: '2026-01-01T00:00:00.000Z',
  cost_usd: 0.014,
};

export const SEEDED_ACTIVE_RUNS: ApiActiveRun[] = [];

export const SEEDED_CONVENTIONS: ApiConventionsPage = {
  scan: { created_at: '2026-01-01T00:00:00.000Z' },
  candidates: [
    {
      category: 'error-handling',
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts:23-31',
      confidence: 0.91,
      status: 'pending',
    },
    {
      category: 'imports',
      rule: 'Redis access goes through src/lib/redis.ts singleton',
      evidence_path: 'src/lib/redis.ts:1-9',
      confidence: 0.85,
      status: 'pending',
    },
    {
      category: 'typing',
      rule: 'All public route handlers return typed Result<T, ApiError>',
      evidence_path: 'src/api/public/index.ts:14-20',
      confidence: 0.78,
      status: 'pending',
    },
  ],
};

/** A fresh, seed-shaped route map: agents, repos, #482's pull + review, and
 * conventions. Callers overwrite/add keys for the scenario under test. */
export function defaultRoutes(): Routes {
  return {
    'GET /agents': { status: 200, body: SEEDED_AGENTS },
    'GET /repos': { status: 200, body: [SEEDED_REPO] },
    [`GET /repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`]: { status: 200, body: SEEDED_PR },
    [`GET /repos/${SEEDED_REPO.id}/pulls`]: { status: 200, body: [SEEDED_PR] },
    [`GET /pulls/${String(SEEDED_PR.id)}`]: { status: 200, body: SEEDED_PR },
    [`GET /pulls/${String(SEEDED_PR.id)}/reviews`]: { status: 200, body: [SEEDED_REVIEW] },
    [`GET /pulls/${String(SEEDED_PR.id)}/runs`]: { status: 200, body: [SEEDED_RUN] },
    [`GET /pulls/${String(SEEDED_PR.id)}/runs/active`]: { status: 200, body: SEEDED_ACTIVE_RUNS },
    [`GET /repos/${SEEDED_REPO.id}/conventions`]: { status: 200, body: SEEDED_CONVENTIONS },
  };
}
