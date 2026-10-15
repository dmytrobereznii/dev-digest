/**
 * Eval cases (slice C): POST /findings/:id/eval-case, GET /agents/:id/evals,
 * DELETE /eval-cases/:id, and `eval_case_id` on the finding record. Real
 * Postgres via testcontainers; the LLM is a MockLLMProvider whose call log must
 * stay empty.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { AgentEvalOverview, EvalCase } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const d = (await dockerAvailable()) ? describe : describe.skip;

const PATCH_CONFIG = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
const PATCH_OTHER = '@@ -1,2 +1,3 @@\n import a;\n+import b;\n import c;';

let pg: PgFixture;
let app: Awaited<ReturnType<typeof buildApp>>;
let llm: MockLLMProvider;
let workspaceId: string;
const db = () => pg.handle.db;

beforeAll(async () => {
  pg = await startPg();
  await seed(db());
  const [ws] = await db().select().from(t.workspaces);
  workspaceId = ws!.id;
  llm = new MockLLMProvider('openai');
  app = await buildApp({
    config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
    db: db(),
    overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), llm: { openai: llm } },
  });
});
afterAll(async () => {
  await app?.close();
  await pg?.stop();
});

let seq = 0;

interface Scenario {
  agentId: string;
  prId: string;
  reviewId: string;
  findingId: string;
}

/** An agent, a PR with one stored file, a review of that agent and one finding. */
async function scenario(
  opts: {
    decision?: 'accepted' | 'dismissed' | null;
    agent?: boolean;
    finding?: Partial<typeof t.findings.$inferInsert>;
    files?: Array<{ path: string; patch: string | null }>;
    agentId?: string;
  } = {},
): Promise<Scenario> {
  const n = seq++;
  const decision = opts.decision === undefined ? 'accepted' : opts.decision;
  let agentId = opts.agentId ?? null;
  if (!agentId && opts.agent !== false) {
    const [agent] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `Eval agent ${n}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'review' })
      .returning();
    agentId = agent!.id;
  }
  const [repo] = await db()
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name: `evalrepo-${n}`, fullName: `acme/evalrepo-${n}` })
    .returning();
  const [pr] = await db()
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 100 + n,
      title: `Original PR title ${n}`,
      body: `Original PR body ${n}`,
      author: 'marisa',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc123',
    })
    .returning();
  const files = opts.files ?? [{ path: 'src/config.ts', patch: PATCH_CONFIG }];
  if (files.length) await db().insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
  const [review] = await db()
    .insert(t.reviews)
    .values({ workspaceId, prId: pr!.id, agentId, kind: 'review', verdict: 'comment', score: 80 })
    .returning();
  const now = new Date();
  const [finding] = await db()
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: 11,
      endLine: 11,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe Secret Key!',
      rationale: 'committed key',
      confidence: 0.9,
      acceptedAt: decision === 'accepted' ? now : null,
      dismissedAt: decision === 'dismissed' ? now : null,
      ...opts.finding,
    })
    .returning();
  return { agentId: agentId!, prId: pr!.id, reviewId: review!.id, findingId: finding!.id };
}

const create = (findingId: string) => app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
const caseRows = (agentId: string) => db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId));
const caseRowsAll = async (findingId: string) =>
  db().select().from(t.evalCases).where(eq(t.evalCases.findingId, findingId));

d('eval cases (real Postgres)', () => {
  it("an accepted finding becomes one must_find case owned by the review's agent, with the finding's file and lines", async () => {
    const s = await scenario({ decision: 'accepted', finding: { startLine: 11, endLine: 12 } });
    const res = await create(s.findingId);
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.owner_id).toBe(s.agentId);
    expect(c.owner_kind).toBe('agent');
    expect(c.finding_id).toBe(s.findingId);
    expect(c.expected_output).toMatchObject({ type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 12 });
    expect(await caseRows(s.agentId)).toHaveLength(1);
  });

  it('a dismissed finding becomes a must_not_flag case', async () => {
    const s = await scenario({ decision: 'dismissed' });
    const res = await create(s.findingId);
    expect(res.statusCode).toBe(201);
    expect(res.json().expected_output).toMatchObject({
      type: 'must_not_flag',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
    });
  });

  it("input_diff is the stored patch of the finding's file under its two header lines, whatever the pr_files row order", async () => {
    const expected = `--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH_CONFIG}`;
    const first = await scenario({
      files: [
        { path: 'src/config.ts', patch: PATCH_CONFIG },
        { path: 'src/other.ts', patch: PATCH_OTHER },
      ],
    });
    const second = await scenario({
      files: [
        { path: 'src/other.ts', patch: PATCH_OTHER },
        { path: 'src/config.ts', patch: PATCH_CONFIG },
      ],
    });
    expect((await create(first.findingId)).json().input_diff).toBe(expected);
    expect((await create(second.findingId)).json().input_diff).toBe(expected);
  });

  it("input_meta holds the PR title and description at creation and keeps them after the PR's title, description and pr_files are replaced", async () => {
    const s = await scenario();
    const before = (await create(s.findingId)).json();
    expect(before.input_meta).toEqual({
      pr_title: expect.stringMatching(/^Original PR title/),
      pr_description: expect.stringMatching(/^Original PR body/),
    });

    await db().update(t.pullRequests).set({ title: 'Replaced', body: 'Replaced body' }).where(eq(t.pullRequests.id, s.prId));
    await db().delete(t.prFiles).where(eq(t.prFiles.prId, s.prId));
    await db().insert(t.prFiles).values({ prId: s.prId, path: 'src/config.ts', patch: PATCH_OTHER });

    const overview = AgentEvalOverview.parse(
      (await app.inject({ method: 'GET', url: `/agents/${s.agentId}/evals` })).json(),
    );
    const after = overview.cases.find((c) => c.id === before.id)!;
    expect(after.input_meta).toEqual(before.input_meta);
    expect(after.input_diff).toBe(before.input_diff);
    expect(after.expected_output).toEqual(before.expected_output);
  });

  it("the name is the finding's title in kebab-case and the expectation carries title, severity and category", async () => {
    const s = await scenario();
    const c = (await create(s.findingId)).json();
    expect(c.name).toBe('hardcoded-stripe-secret-key');
    expect(c.expected_output).toMatchObject({
      title: 'Hardcoded Stripe Secret Key!',
      severity: 'CRITICAL',
      category: 'security',
    });
  });

  it('a second creation request for one finding returns the existing case and leaves one row', async () => {
    const s = await scenario();
    const first = await create(s.findingId);
    const second = await create(s.findingId);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(await caseRowsAll(s.findingId)).toHaveLength(1);
  });

  it('an undecided finding is 409 finding_undecided and stores nothing', async () => {
    const s = await scenario({ decision: null });
    const res = await create(s.findingId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_undecided');
    expect(await caseRows(s.agentId)).toHaveLength(0);
  });

  it('a finding whose review has no agent is 409 finding_agent_missing and stores nothing', async () => {
    const s = await scenario({ agent: false });
    const res = await create(s.findingId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_agent_missing');
    expect(await caseRowsAll(s.findingId)).toHaveLength(0);
  });

  it('a file with no stored patch is 409 diff_unavailable and stores nothing', async () => {
    const noRow = await scenario({ files: [{ path: 'src/other.ts', patch: PATCH_OTHER }] });
    const nullPatch = await scenario({ files: [{ path: 'src/config.ts', patch: null }] });
    for (const s of [noRow, nullPatch]) {
      const res = await create(s.findingId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('diff_unavailable');
      expect(await caseRows(s.agentId)).toHaveLength(0);
    }
  });

  it('a finding the grounding gate drops against the fragment is 409 finding_outside_stored_diff; a full-file kind is accepted', async () => {
    const outside = await scenario({ finding: { startLine: 999, endLine: 999 } });
    const res = await create(outside.findingId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_outside_stored_diff');
    expect(await caseRows(outside.agentId)).toHaveLength(0);

    const fullFile = await scenario({ finding: { startLine: 999, endLine: 999, kind: 'secret_leak' } });
    const ok = await create(fullFile.findingId);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().expected_output).toMatchObject({ start_line: 999, end_line: 999 });
  });

  it('GET /pulls/:id/reviews and the accept and dismiss responses carry eval_case_id: the case id, else null', async () => {
    const s = await scenario({ decision: null });
    const listed = async () => {
      const reviews = (await app.inject({ method: 'GET', url: `/pulls/${s.prId}/reviews` })).json();
      return reviews[0].findings[0].eval_case_id;
    };
    expect(await listed()).toBeNull();

    const accepted = await app.inject({ method: 'POST', url: `/findings/${s.findingId}/accept` });
    expect(accepted.json().finding.eval_case_id).toBeNull();

    const c = (await create(s.findingId)).json();
    expect(await listed()).toBe(c.id);
    const acceptedAgain = await app.inject({ method: 'POST', url: `/findings/${s.findingId}/accept` });
    expect(acceptedAgain.json().finding.eval_case_id).toBe(c.id);
    const dismissed = await app.inject({ method: 'POST', url: `/findings/${s.findingId}/dismiss` });
    expect(dismissed.json().finding.eval_case_id).toBe(c.id);
  });

  it("changing the finding's decision after creation leaves the expectation unchanged", async () => {
    const s = await scenario({ decision: 'accepted' });
    const c = (await create(s.findingId)).json();
    expect(c.expected_output.type).toBe('must_find');

    await app.inject({ method: 'POST', url: `/findings/${s.findingId}/dismiss` });

    const [row] = await caseRowsAll(s.findingId);
    expect(row!.expectationType).toBe('must_find');
    const again = await create(s.findingId);
    expect(again.statusCode).toBe(200);
    expect(again.json().expected_output).toEqual(c.expected_output);
  });

  it('deleting the finding\'s review keeps the case with finding_id null and the same input_diff, input_meta and expectation', async () => {
    const s = await scenario();
    const c = (await create(s.findingId)).json();

    await db().delete(t.reviews).where(eq(t.reviews.id, s.reviewId));

    const overview = AgentEvalOverview.parse(
      (await app.inject({ method: 'GET', url: `/agents/${s.agentId}/evals` })).json(),
    );
    expect(overview.cases).toHaveLength(1);
    const kept = overview.cases[0]!;
    expect(kept.id).toBe(c.id);
    expect(kept.finding_id).toBeNull();
    expect(kept.input_diff).toBe(c.input_diff);
    expect(kept.input_meta).toEqual(c.input_meta);
    expect(kept.expected_output).toEqual(c.expected_output);
  });

  it('GET /agents/:id/evals lists every case of the agent, last_result null before any run', async () => {
    const a = await scenario();
    const b = await scenario({ agentId: a.agentId, decision: 'dismissed' });
    const other = await scenario();
    const ca = (await create(a.findingId)).json();
    const cb = (await create(b.findingId)).json();
    await create(other.findingId);

    const res = await app.inject({ method: 'GET', url: `/agents/${a.agentId}/evals` });
    expect(res.statusCode).toBe(200);
    const overview = AgentEvalOverview.parse(res.json());
    expect(overview.agent.id).toBe(a.agentId);
    expect(overview.cases.map((c) => c.id).sort()).toEqual([ca.id, cb.id].sort());
    expect(overview.cases_total).toBe(2);
    expect(overview.cases.every((c) => c.last_result === null)).toBe(true);
  });

  it('DELETE /eval-cases/:id removes the case and the finding record then carries eval_case_id null', async () => {
    const s = await scenario();
    const c = (await create(s.findingId)).json();

    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect(await caseRows(s.agentId)).toHaveLength(0);
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${s.prId}/reviews` })).json();
    expect(reviews[0].findings[0].eval_case_id).toBeNull();
    const overview = (await app.inject({ method: 'GET', url: `/agents/${s.agentId}/evals` })).json();
    expect(overview.cases).toEqual([]);
  });

  it('after a delete the finding becomes a case again, typed from its current decision', async () => {
    const s = await scenario({ decision: 'accepted' });
    const first = (await create(s.findingId)).json();
    expect(first.expected_output.type).toBe('must_find');
    await app.inject({ method: 'DELETE', url: `/eval-cases/${first.id}` });

    await app.inject({ method: 'POST', url: `/findings/${s.findingId}/dismiss` });
    const second = await create(s.findingId);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.id);
    expect(second.json().expected_output.type).toBe('must_not_flag');
  });

  it('deleting a case while a run of its agent is running is 409 eval_run_in_progress and keeps the case', async () => {
    const s = await scenario();
    const c = (await create(s.findingId)).json();
    const [run] = await db()
      .insert(t.evalRuns)
      .values({
        workspaceId,
        agentId: s.agentId,
        status: 'running',
        agentVersion: 1,
        systemPrompt: 'review',
        model: 'gpt-4.1',
        provider: 'openai',
        tracesTotal: 1,
      })
      .returning();

    const res = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('eval_run_in_progress');
    expect(await caseRows(s.agentId)).toHaveLength(1);

    // once the run is no longer running the delete goes through
    await db().update(t.evalRuns).set({ status: 'completed' }).where(eq(t.evalRuns.id, run!.id));
    const after = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    expect(after.statusCode).toBe(200);
  });

  it('deleting an unknown case is 404, and so is a second delete', async () => {
    const unknown = await app.inject({ method: 'DELETE', url: '/eval-cases/00000000-0000-4000-8000-000000000000' });
    expect(unknown.statusCode).toBe(404);

    const s = await scenario();
    const c = (await create(s.findingId)).json();
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
  });

  it('creating, listing and deleting a case record zero provider calls', async () => {
    const before = llm.calls.length;
    const s = await scenario();
    const c = (await create(s.findingId)).json();
    await app.inject({ method: 'GET', url: `/agents/${s.agentId}/evals` });
    await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    expect(llm.calls.length).toBe(before);
  });

  it('case responses parse against the shared contracts and an invalid id is 422', async () => {
    const s = await scenario();
    const res = await create(s.findingId);
    expect(EvalCase.safeParse(res.json()).success).toBe(true);
    expect(EvalCase.safeParse((await create(s.findingId)).json()).success).toBe(true);

    expect((await create('not-a-uuid')).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/agents/not-a-uuid/evals' })).statusCode).toBe(422);
    expect((await app.inject({ method: 'DELETE', url: '/eval-cases/not-a-uuid' })).statusCode).toBe(422);

    // ids of another workspace resolve to 404
    const [foreignWs] = await db().insert(t.workspaces).values({ name: 'foreign-eval-ws' }).returning();
    const [foreignAgent] = await db()
      .insert(t.agents)
      .values({ workspaceId: foreignWs!.id, name: 'foreign', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [foreignCase] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId: foreignWs!.id,
        agentId: foreignAgent!.id,
        name: 'foreign-case',
        expectationType: 'must_find',
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        title: 't',
        severity: 'WARNING',
        category: 'bug',
        inputDiff: 'd',
        prTitle: 'p',
      })
      .returning();
    expect((await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/evals` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${foreignCase!.id}` })).statusCode).toBe(404);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, foreignCase!.id))).toHaveLength(1);
  });
});
