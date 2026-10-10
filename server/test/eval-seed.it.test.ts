/**
 * The L06 demo seed on a real database: the fixture agent with its cases and
 * runs, the accepted #482 findings, idempotence, and the seeded Stripe finding
 * becoming a case through the API (the API half of e2e flow 17).
 * Every `seed()` and `buildApp` here gets the container's `db`, never the dev one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import {
  EVAL_DEMO_AGENT_NAME,
  EVAL_CASE_N_PLUS_ONE,
  EVAL_CASE_SIGNATURE_OK,
} from '../src/db/seed-evals.js';

const d = (await dockerAvailable()) ? describe : describe.skip;

const STRIPE_TITLE = 'Hardcoded Stripe secret key in commit';
const N_PLUS_ONE_TITLE = 'N+1 query in user list endpoint';

let pg: PgFixture;
let app: Awaited<ReturnType<typeof buildApp>>;
const db = () => pg.handle.db;

async function demoAgent() {
  const [agent] = await db().select().from(t.agents).where(eq(t.agents.name, EVAL_DEMO_AGENT_NAME));
  return agent!;
}

/** The #482 sample review (model 'seed') with its findings, straight from the DB. */
async function sample482() {
  const [pr] = await db().select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
  const [review] = await db()
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.model, 'seed')));
  const findings = await db().select().from(t.findings).where(eq(t.findings.reviewId, review!.id));
  return { pr: pr!, review: review!, findings };
}

const finding = (rows: Awaited<ReturnType<typeof sample482>>['findings'], title: string) =>
  rows.find((f) => f.title === title)!;

const countRows = async () => ({
  agents: (await db().select().from(t.agents)).length,
  cases: (await db().select().from(t.evalCases)).length,
  runs: (await db().select().from(t.evalRuns)).length,
  results: (await db().select().from(t.evalCaseResults)).length,
  versions: (await db().select().from(t.agentVersions)).length,
});

beforeAll(async () => {
  if (!(await dockerAvailable())) return;
  pg = await startPg();
  await seed(db());
  app = await buildApp({
    config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
    db: db(),
    overrides: {
      embedder: new MockEmbedder(),
      git: new MockGitClient(),
      llm: { openai: new MockLLMProvider('openai') },
    },
  });
});
afterAll(async () => {
  await app?.close();
  await pg?.stop();
});

d('eval demo seed (real Postgres)', () => {
  it('a seeded database has the fixture agent with its cases and two completed runs', async () => {
    const agent = await demoAgent();
    expect(agent.enabled).toBe(false);
    expect(agent.version).toBe(2);

    const versions = await db().select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const cases = await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id));
    const byName = new Map(cases.map((c) => [c.name, c]));
    expect([...byName.keys()].sort()).toEqual([EVAL_CASE_N_PLUS_ONE, EVAL_CASE_SIGNATURE_OK].sort());
    expect(byName.get(EVAL_CASE_N_PLUS_ONE)!.expectationType).toBe('must_find');
    expect(byName.get(EVAL_CASE_SIGNATURE_OK)!.expectationType).toBe('must_not_flag');

    const { findings } = await sample482();
    expect(byName.get(EVAL_CASE_N_PLUS_ONE)!.findingId).toBe(finding(findings, N_PLUS_ONE_TITLE).id);
    expect(byName.get(EVAL_CASE_SIGNATURE_OK)!.findingId).toBeNull();

    const runs = await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id));
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === 'completed')).toBe(true);
    expect(runs.map((r) => r.agentVersion).sort()).toEqual([1, 2]);
    expect(new Set(runs.map((r) => r.systemPrompt)).size).toBe(2);
    for (const run of runs) {
      const results = await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id));
      expect(results.map((r) => r.caseId).sort()).toEqual(cases.map((c) => c.id).sort());
    }
  });

  it('the seeded accepted Stripe finding has no eval case and its review has an agent', async () => {
    const { review, findings } = await sample482();
    expect(review.agentId).not.toBeNull();
    const [owner] = await db().select().from(t.agents).where(eq(t.agents.id, review.agentId!));
    expect(owner).toBeDefined();

    const stripe = finding(findings, STRIPE_TITLE);
    expect(stripe.acceptedAt).not.toBeNull();
    expect(stripe.dismissedAt).toBeNull();
    const cases = await db().select().from(t.evalCases).where(eq(t.evalCases.findingId, stripe.id));
    expect(cases).toHaveLength(0);
  });

  it('re-running the seed adds no case or run and keeps a user’s decision on a finding', async () => {
    const stripeId = finding((await sample482()).findings, STRIPE_TITLE).id;
    const before = await countRows();

    const dismissed = await app.inject({ method: 'POST', url: `/findings/${stripeId}/dismiss` });
    expect(dismissed.statusCode).toBe(200);
    try {
      await seed(db());

      expect(await countRows()).toEqual(before);
      const after = finding((await sample482()).findings, STRIPE_TITLE);
      expect(after.dismissedAt).not.toBeNull();
      expect(after.acceptedAt).toBeNull();
    } finally {
      // Put the seeded state back for the case-creation test below.
      await app.inject({ method: 'POST', url: `/findings/${stripeId}/accept` });
    }
    const restored = finding((await sample482()).findings, STRIPE_TITLE);
    expect(restored.acceptedAt).not.toBeNull();
    expect(restored.dismissedAt).toBeNull();
  });

  it('the seeded accepted finding becomes a case through POST /findings/:id/eval-case', async () => {
    const { pr, review, findings } = await sample482();
    const stripe = finding(findings, STRIPE_TITLE);

    const created = await app.inject({ method: 'POST', url: `/findings/${stripe.id}/eval-case` });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.finding_id).toBe(stripe.id);
    expect(body.owner_id).toBe(review.agentId);
    expect(body.expected_output).toMatchObject({ file: 'src/config.ts', start_line: 12, end_line: 12 });
    expect(body.input_diff).toContain('sk_live_');

    // The control's "created" state: the finding now reports its case.
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json() as Array<{
      findings: Array<{ id: string; eval_case_id: string | null }>;
    }>;
    const listed = reviews.flatMap((r) => r.findings).find((f) => f.id === stripe.id);
    expect(listed?.eval_case_id).toBe(body.id);

    const again = await app.inject({ method: 'POST', url: `/findings/${stripe.id}/eval-case` });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(body.id);
  });
});
