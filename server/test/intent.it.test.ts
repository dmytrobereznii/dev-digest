import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * T7 — the intent route + its shared review-step-0 pre-work (D2/D9). Real
 * Postgres via testcontainers; the LLM is always the mock, and `secrets` is
 * always overridden too, so a real key on the host never reaches these tests
 * (openrouter is the `review_intent` default and would otherwise be tried).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Long enough to be deterministically 'high' confidence (≥300 meaningful
 *  chars), and carries the two markdown-link references A5 exercises. */
const PR_BODY = [
  'This change fixes the pagination bug on the orders list endpoint, where the ' +
    'last page was silently skipped whenever the page size evenly divided the ' +
    'total row count. It recomputes the offset from the total count returned by ' +
    'the count query instead of assuming a fixed page size, and adds a ' +
    'regression test that asserts the exact boundary where the old code dropped ' +
    'a page.',
  '',
  'See [the design write-up](https://example.com/pagination-spec) for context ' +
    '(never fetched — external links are informational only), and ' +
    '[a path that escapes the repo](../../secrets.json) — that link exists only ' +
    'to prove the resolver rejects it.',
].join('\n');

const INTENT_DRAFT = {
  intent: 'Fix an off-by-one in orders-list pagination that silently drops the last page.',
  in_scope: ['Recompute the offset from the total row count', 'Cover the exact boundary in tests'],
  out_of_scope: ['Changing the default page size'],
};

const REVIEW_FIXTURE = {
  verdict: 'approve',
  summary: 'Looks correct.',
  score: 90,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501,
      title: 'Fix orders-list pagination off-by-one',
      author: 'jrn.pearse',
      branch: 'fix/orders-pagination',
      base: 'main',
      headSha: 'sha-v1',
      additions: 12,
      deletions: 4,
      filesCount: 2,
      status: 'needs_review',
      body: PR_BODY,
      ...overrides,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/api/orders.ts',
    additions: 12,
    deletions: 4,
    patch: '@@ -20,4 +20,12 @@\n   const offset = page * pageSize;\n+  // fixed below',
  });
  return { repo: repo!, pr: pr! };
}

d('intent module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** `mock` serves BOTH providers so a review-step-0 intent call and the
   *  actual agent call can share one fixture set keyed by schemaName. */
  function appWith(mock: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        llm: { openai: mock, openrouter: mock },
      },
    });
  }

  it('POST derives + persists confidence/sources/model/cost; GET reflects it and turns stale on a new head_sha', async () => {
    const mock = new MockLLMProvider('openai', { structuredBySchema: { IntentDraft: INTENT_DRAFT } });
    const app = await appWith(mock);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const derived = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });
    expect(derived.statusCode).toBe(200);
    const record = derived.json();
    expect(record.intent).toBe(INTENT_DRAFT.intent);
    expect(record.in_scope).toEqual(INTENT_DRAFT.in_scope);
    expect(record.confidence).toBe('high'); // documentedChars ≥ 300 (D7)
    expect(record.model).toBe('anthropic/claude-haiku-4.5'); // D12 default
    expect(record.cost_usd).toBe(0.001); // MockLLMProvider's fixed cost
    expect(record.head_sha).toBe('sha-v1');
    expect(record.stale).toBe(false);

    // A5 — one external_not_fetched, one outside_repo; no third-party fetch.
    const byKind = new Map(record.sources.map((s: { kind: string; reason: string }) => [s.kind, s.reason]));
    expect(byKind.get('external')).toBe('external_not_fetched');
    expect(byKind.get('repo_file')).toBe('outside_repo');
    expect(record.sources.every((s: { status: string }) => s.status === 'skipped')).toBe(true);

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.json().intent.stale).toBe(false);

    // Simulate a new push: head_sha moves without a re-derivation.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-v2' }).where(eq(t.pullRequests.id, pr.id));
    const staleRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(staleRes.json().intent.stale).toBe(true);
    // The row itself is untouched by a mere GET (D2 — never derives on a read).
    expect(staleRes.json().intent.head_sha).toBe('sha-v1');

    await app.close();
  });

  it('seeded #482 has a high-confidence row with a skipped source, and #479 a low one (§7)', async () => {
    const mock = new MockLLMProvider('openai', { structuredBySchema: { IntentDraft: INTENT_DRAFT } });
    const app = await appWith(mock);

    const [pr482] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const res482 = await app.inject({ method: 'GET', url: `/pulls/${pr482!.id}/intent` });
    expect(res482.statusCode).toBe(200);
    const intent482 = res482.json().intent;
    expect(intent482.confidence).toBe('high');
    expect(intent482.model).toBe('anthropic/claude-haiku-4.5');
    expect(intent482.stale).toBe(false); // seeded head_sha matches the seeded PR row
    expect(intent482.sources).toHaveLength(1);
    expect(intent482.sources[0].status).toBe('skipped');

    const [pr479] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 479));
    const res479 = await app.inject({ method: 'GET', url: `/pulls/${pr479!.id}/intent` });
    const intent479 = res479.json().intent;
    expect(intent479.confidence).toBe('low');
    expect(intent479.signals).toEqual(['title', 'commits', 'branch', 'file_paths']);

    // Neither GET touched the LLM (D2 — GET never derives).
    expect(mock.calls).toHaveLength(0);

    await app.close();
  });

  it('GET on a PR with no row returns { intent: null } and calls the LLM zero times', async () => {
    const mock = new MockLLMProvider('openai', { structuredBySchema: { IntentDraft: INTENT_DRAFT } });
    const app = await appWith(mock);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
    expect(mock.calls).toHaveLength(0);

    await app.close();
  });

  it('a failing classifier → 502 intent_failed, and a previous row survives untouched', async () => {
    const goodMock = new MockLLMProvider('openai', { structuredBySchema: { IntentDraft: INTENT_DRAFT } });
    const app1 = await appWith(goodMock);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const first = await app1.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: {} });
    expect(first.statusCode).toBe(200);
    const before = first.json();
    await app1.close();

    // A fixture that fails IntentDraft's schema (no `intent` field) — the
    // classifier call throws, and the upsert this test proves never happens.
    const badMock = new MockLLMProvider('openai', {
      structuredBySchema: { IntentDraft: { in_scope: [], out_of_scope: [] } },
    });
    const app2 = await appWith(badMock);
    const failed = await app2.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/intent`,
      payload: { force: true },
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('intent_failed');

    const after = (await app2.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().intent;
    expect(after).toEqual(before);

    await app2.close();
  });

  it('a review run stores prompt_assembly.intent in the trace', async () => {
    const mock = new MockLLMProvider('openai', {
      structuredBySchema: { IntentDraft: INTENT_DRAFT, Review: REVIEW_FIXTURE },
    });
    const app = await appWith(mock);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review it' },
      })
    ).json();

    const run = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId = run.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent).toContain('## PR intent (confidence: high)');
    expect(trace.prompt_assembly.user).toContain('## PR intent');
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('intent: derived with'))).toBe(true);

    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.status).toBe('done');

    await app.close();
  });

  it('a run with a failing classifier still ends `done`, with no intent section in the prompt', async () => {
    // No 'IntentDraft' fixture at all → the default `{}` fails IntentDraft's
    // schema, so `deriveIntent` throws and `ensure()` propagates it.
    const mock = new MockLLMProvider('openai', { structuredBySchema: { Review: REVIEW_FIXTURE } });
    const app = await appWith(mock);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review it' },
      })
    ).json();

    const run = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId = run.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## PR intent');
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('intent: unavailable'))).toBe(true);

    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.status).toBe('done');

    await app.close();
  });
});
