/**
 * Eval runs (slice D): POST /agents/:id/eval-runs, GET /eval-runs/:id,
 * GET /agents/:id/evals, GET /eval/dashboard and the boot reaper. Real Postgres
 * through testcontainers; the LLM is a MockLLMProvider (gated or failing where a
 * test needs to hold or break a run). No provider key is read from the
 * environment.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import {
  AgentEvalOverview,
  EvalCaseResult,
  EvalDashboard,
  EvalRunDetail,
  EvalRunSummary,
  type LLMProvider,
  type StructuredRequest,
  type StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { EVAL_RUN_INTERRUPTED } from '../src/modules/eval/constants.js';
import { scoreRun, type ScoredCaseInput } from '../src/modules/eval/scoring.js';
import * as t from '../src/db/schema.js';

const d = (await dockerAvailable()) ? describe : describe.skip;

type App = Awaited<ReturnType<typeof buildApp>>;

let pg: PgFixture;
let workspaceId: string;
const db = () => pg.handle.db;

// ---- fixtures ---------------------------------------------------------------

const FINDING = {
  id: 'f1',
  severity: 'WARNING',
  category: 'bug',
  title: 'Suspicious import',
  file: 'src/a.ts',
  start_line: 2,
  end_line: 2,
  rationale: 'because',
  confidence: 0.9,
} as const;

/** One finding on src/a.ts line 2, which exists in `diffFor('src/a.ts')`. */
const REVIEW = { verdict: 'comment', summary: 'ok', score: 70, findings: [FINDING] };

/** A diff of one file whose hunk adds line 2. */
function diffFor(file: string, marker = 'import b;'): string {
  return `--- a/${file}\n+++ b/${file}\n@@ -1,2 +1,3 @@\n import a;\n+${marker}\n import c;`;
}

/** Holds every provider call until `release()`; counts the calls that arrived. */
class GatedLLM extends MockLLMProvider {
  entered = 0;
  release!: () => void;
  private gate: Promise<void>;
  constructor() {
    super('openai', { structured: REVIEW });
    this.gate = new Promise<void>((r) => (this.release = r));
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.entered++;
    await this.gate;
    return super.completeStructured(req);
  }
}

/** Throws `message` on its `failOn`-th call (1-based); other calls succeed. */
class FailingLLM extends MockLLMProvider {
  private n = 0;
  constructor(
    private failOn: number,
    private message: string,
  ) {
    super('openai', { structured: REVIEW });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.n++;
    if (this.n === this.failOn) {
      this.calls.push({ method: 'completeStructured', req });
      throw new Error(this.message);
    }
    return super.completeStructured(req);
  }
}

/** Answers `costUsd: null` on its `nullOn`-th call. */
class UnknownCostLLM extends MockLLMProvider {
  private n = 0;
  constructor(private nullOn: number) {
    super('openai', { structured: REVIEW });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.n++;
    const res = await super.completeStructured(req);
    return this.n === this.nullOn ? { ...res, costUsd: null } : res;
  }
}

const apps: App[] = [];
async function makeApp(
  llm: { openai?: LLMProvider; anthropic?: LLMProvider },
  env: Record<string, string> = {},
): Promise<App> {
  const app = await buildApp({
    config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env } as NodeJS.ProcessEnv),
    db: db(),
    overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), llm },
  });
  apps.push(app);
  return app;
}

beforeAll(async () => {
  pg = await startPg();
  await seed(db());
  const [ws] = await db().select().from(t.workspaces);
  workspaceId = ws!.id;
});
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});
afterAll(async () => {
  await pg?.stop();
});

let seq = 0;

async function mkAgent(opts: Partial<typeof t.agents.$inferInsert> = {}) {
  const n = ++seq;
  const [agent] = await db()
    .insert(t.agents)
    .values({
      workspaceId,
      name: `Run agent ${n}`,
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: `review ${n}`,
      ...opts,
    })
    .returning();
  return agent!;
}

async function mkCase(
  agentId: string,
  opts: Partial<typeof t.evalCases.$inferInsert> & { wsId?: string } = {},
) {
  const n = ++seq;
  const { wsId, ...rest } = opts;
  const file = rest.file ?? 'src/a.ts';
  const [row] = await db()
    .insert(t.evalCases)
    .values({
      workspaceId: wsId ?? workspaceId,
      agentId,
      name: `case-${n}`,
      expectationType: 'must_find',
      file,
      startLine: 2,
      endLine: 2,
      title: 'Suspicious import',
      severity: 'WARNING',
      category: 'bug',
      inputDiff: diffFor(file),
      prTitle: `Frozen PR title ${n}`,
      prDescription: `Frozen PR description ${n}`,
      ...rest,
    })
    .returning();
  return row!;
}

async function mkRun(agentId: string, opts: Partial<typeof t.evalRuns.$inferInsert> = {}) {
  const [row] = await db()
    .insert(t.evalRuns)
    .values({
      workspaceId,
      agentId,
      status: 'completed',
      agentVersion: 1,
      systemPrompt: 'p',
      model: 'gpt-4.1',
      provider: 'openai',
      tracesTotal: 1,
      tracesPassed: 1,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      ...opts,
    })
    .returning();
  return row!;
}

const startRun = (app: App, agentId: string) =>
  app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
const getRun = (app: App, runId: string) => app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
const runRows = (agentId: string) => db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agentId));

async function until(check: () => boolean | Promise<boolean>, what: string, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (!(await check())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Poll GET /eval-runs/:id until the run leaves `running`. */
async function waitRun(app: App, runId: string) {
  let detail: ReturnType<typeof EvalRunDetail.parse> | undefined;
  await until(async () => {
    const res = await getRun(app, runId);
    if (res.statusCode !== 200) return false;
    detail = res.json();
    return detail!.status !== 'running';
  }, `run ${runId} to finish`);
  return detail!;
}

const completeStructuredCalls = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured');
const userPrompt = (call: { req: unknown }) =>
  (call.req as StructuredRequest<unknown>).messages.find((m) => m.role === 'user')!.content as string;
const systemPrompt = (call: { req: unknown }) =>
  (call.req as StructuredRequest<unknown>).messages.find((m) => m.role === 'system')!.content as string;

d('eval runs (real Postgres)', () => {
  it('POST /agents/:id/eval-runs answers 201 with the id and running status of one stored run', async () => {
    const llm = new GatedLLM();
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id);
    try {
      const res = await startRun(app, agent.id);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('running');
      expect(body.agent_id).toBe(agent.id);
      const rows = await runRows(agent.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(body.id);
      expect(rows[0]!.status).toBe('running');
    } finally {
      llm.release();
    }
    const [row] = await runRows(agent.id);
    await waitRun(app, row!.id);
  });

  it("the run stores the agent's version, system prompt, model and provider, and returns them unchanged after the agent is edited", async () => {
    const llm = new GatedLLM();
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent({ systemPrompt: 'PROMPT-ONE', model: 'gpt-4.1' });
    await mkCase(agent.id);
    let runId: string;
    try {
      const res = await startRun(app, agent.id);
      expect(res.statusCode).toBe(201);
      runId = res.json().id;
      expect(res.json()).toMatchObject({ agent_version: 1, model: 'gpt-4.1', provider: 'openai' });
      await until(() => llm.entered > 0, 'the run to reach the provider');

      const edit = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'PROMPT-TWO', model: 'gpt-4.1-mini' },
      });
      expect(edit.statusCode).toBe(200);
      const [edited] = await db().select().from(t.agents).where(eq(t.agents.id, agent.id));
      expect(edited!.version).toBe(2);
      expect(edited!.systemPrompt).toBe('PROMPT-TWO');
    } finally {
      llm.release();
    }
    const detail = await waitRun(app, runId);
    expect(detail.status).toBe('completed');
    expect(detail.system_prompt).toBe('PROMPT-ONE');
    expect(detail.model).toBe('gpt-4.1');
    expect(detail.agent_version).toBe(1);
    expect(detail.provider).toBe('openai');
    // the engine ran with the stored config, not the edited one
    const [call] = completeStructuredCalls(llm);
    expect((call!.req as StructuredRequest<unknown>).model).toBe('gpt-4.1');
    expect(systemPrompt(call!)).toContain('PROMPT-ONE');
    expect(systemPrompt(call!)).not.toContain('PROMPT-TWO');
    // and the stored copy is still what a later read returns
    const again = (await getRun(app, runId)).json();
    expect(again.system_prompt).toBe('PROMPT-ONE');
    expect(again.agent_version).toBe(1);
  });

  it('a completed run has one result per case that was in the set at creation; a case created during the run is not in it', async () => {
    const llm = new GatedLLM();
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    const a = await mkCase(agent.id, { name: 'first-case' });
    const b = await mkCase(agent.id, { name: 'second-case' });
    let runId: string;
    let late: Awaited<ReturnType<typeof mkCase>>;
    try {
      const res = await startRun(app, agent.id);
      runId = res.json().id;
      await until(() => llm.entered > 0, 'the run to reach the provider');
      late = await mkCase(agent.id, { name: 'late-case' });
    } finally {
      llm.release();
    }
    const detail = await waitRun(app, runId);
    expect(detail.status).toBe('completed');
    expect(detail.traces_total).toBe(2);
    expect(detail.results.map((r) => r.case_id).sort()).toEqual([a.id, b.id].sort());
    expect(detail.results.map((r) => r.case_id)).not.toContain(late!.id);
    expect(completeStructuredCalls(llm)).toHaveLength(2);
    for (const r of detail.results) {
      expect(EvalCaseResult.parse(r)).toEqual(r);
      expect(r.case_name).toBe(r.case_id === a.id ? 'first-case' : 'second-case');
    }
  });

  it("each case reaches the provider of the agent's provider id with the system prompt, model, enabled linked skills, the case's input_diff and its PR description", async () => {
    const openai = new MockLLMProvider('openai', { structured: REVIEW });
    const anthropic = new MockLLMProvider('anthropic', { structured: REVIEW });
    const app = await makeApp({ openai, anthropic });
    const agent = await mkAgent({ provider: 'anthropic', model: 'claude-test', systemPrompt: 'SYSTEM-MARKER' });
    const [on] = await db()
      .insert(t.skills)
      .values({ workspaceId, name: 'on-skill', description: 'd', type: 'rubric', source: 'manual', body: 'ENABLED-SKILL-BODY', enabled: true })
      .returning();
    const [off] = await db()
      .insert(t.skills)
      .values({ workspaceId, name: 'off-skill', description: 'd', type: 'rubric', source: 'manual', body: 'DISABLED-SKILL-BODY', enabled: false })
      .returning();
    await db().insert(t.agentSkills).values([
      { agentId: agent.id, skillId: on!.id, order: 0 },
      { agentId: agent.id, skillId: off!.id, order: 1 },
    ]);
    await mkCase(agent.id, { inputDiff: diffFor('src/a.ts', 'DIFF-MARKER-ONE'), prDescription: 'DESC-MARKER' });
    await mkCase(agent.id, { inputDiff: diffFor('src/a.ts', 'DIFF-MARKER-TWO'), prDescription: null });

    const res = await startRun(app, agent.id);
    expect((await waitRun(app, res.json().id)).status).toBe('completed');

    expect(openai.calls).toEqual([]);
    const calls = completeStructuredCalls(anthropic);
    expect(calls).toHaveLength(2);
    const one = calls.find((c) => userPrompt(c).includes('DIFF-MARKER-ONE'))!;
    const two = calls.find((c) => userPrompt(c).includes('DIFF-MARKER-TWO'))!;
    for (const c of [one, two]) {
      expect((c.req as StructuredRequest<unknown>).model).toBe('claude-test');
      expect(systemPrompt(c)).toContain('SYSTEM-MARKER');
      expect(userPrompt(c)).toContain('ENABLED-SKILL-BODY');
      expect(userPrompt(c)).not.toContain('DISABLED-SKILL-BODY');
    }
    expect(userPrompt(one)).toContain('DESC-MARKER');
    expect(userPrompt(two)).not.toContain('## PR description');
  });

  it('no request carries a repo map, callers digest, intent, project document or memory section, or the PR title', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id, { prTitle: 'UNIQUE-PR-TITLE-MARKER', prDescription: 'some description' });

    const res = await startRun(app, agent.id);
    expect((await waitRun(app, res.json().id)).status).toBe('completed');

    // the headings come from the engine's own prompt source, so a rename there fails here first
    const promptSource = readFileSync(new URL('../../reviewer-core/src/prompt.ts', import.meta.url), 'utf8');
    const absent = ['Repo skeleton', 'Callers of changed symbols', 'PR intent', 'Project context', 'Relevant memory'];
    for (const heading of absent) expect(promptSource).toContain(`## ${heading}`);

    const [call] = completeStructuredCalls(llm);
    const user = userPrompt(call!);
    // control: the sections an eval case does carry are rendered
    expect(user).toContain('## PR description');
    expect(user).toContain('## Diff to review');
    for (const heading of absent) expect(user).not.toContain(`## ${heading}`);
    expect(user).not.toContain('UNIQUE-PR-TITLE-MARKER');
    expect(systemPrompt(call!)).not.toContain('UNIQUE-PR-TITLE-MARKER');
  });

  it('a completed run stores the three metrics, traces_passed, traces_total and duration_ms, equal to scoreRun over the fixture', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    // the mock always finds src/a.ts:2; grounding drops it for a diff of another file
    const hit = await mkCase(agent.id, { name: 'hit', file: 'src/a.ts', expectationType: 'must_find' });
    const miss = await mkCase(agent.id, { name: 'miss', file: 'src/c.ts', expectationType: 'must_find' });
    const quiet = await mkCase(agent.id, { name: 'quiet', file: 'src/b.ts', expectationType: 'must_not_flag' });

    const res = await startRun(app, agent.id);
    const detail = await waitRun(app, res.json().id);
    expect(detail.status).toBe('completed');

    const expectation = (c: typeof hit) => ({
      type: c.expectationType,
      file: c.file,
      start_line: c.startLine,
      end_line: c.endLine,
    });
    const inputs: ScoredCaseInput[] = [
      { case_id: hit.id, case_name: 'hit', expectation: expectation(hit), kept: [FINDING], dropped: 0, duration_ms: 0, cost_usd: 0 },
      { case_id: miss.id, case_name: 'miss', expectation: expectation(miss), kept: [], dropped: 1, duration_ms: 0, cost_usd: 0 },
      { case_id: quiet.id, case_name: 'quiet', expectation: expectation(quiet), kept: [], dropped: 1, duration_ms: 0, cost_usd: 0 },
    ];
    const { metrics } = scoreRun(inputs);
    expect(detail.recall).toBe(metrics.recall);
    expect(detail.precision).toBe(metrics.precision);
    expect(detail.citation_accuracy).toBe(metrics.citation_accuracy);
    expect(detail.traces_passed).toBe(metrics.traces_passed);
    expect(detail.traces_total).toBe(metrics.traces_total);
    // literal anchors, so a scorer change cannot move both sides together
    expect(metrics.recall).toBe(0.5);
    expect(metrics.precision).toBe(1);
    expect(metrics.citation_accuracy).toBeCloseTo(1 / 3, 10);
    expect(metrics.traces_passed).toBe(2);
    expect(detail.duration_ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(detail.duration_ms)).toBe(true);
    expect(detail.error).toBeNull();
  });

  it("cost_usd is the sum of the cases' costs, and null when one case's cost is unknown", async () => {
    // the mock reports 0.001 per call
    const known = new MockLLMProvider('openai', { structured: REVIEW });
    const knownApp = await makeApp({ openai: known });
    const a1 = await mkAgent();
    await mkCase(a1.id);
    await mkCase(a1.id);
    await mkCase(a1.id);
    const done = await waitRun(knownApp, (await startRun(knownApp, a1.id)).json().id);
    expect(done.status).toBe('completed');
    expect(done.cost_usd).toBeCloseTo(0.003, 10);
    expect(done.results.map((r) => r.cost_usd)).toEqual([0.001, 0.001, 0.001]);

    const unknown = new UnknownCostLLM(2);
    const unknownApp = await makeApp({ openai: unknown });
    const a2 = await mkAgent();
    await mkCase(a2.id);
    await mkCase(a2.id);
    await mkCase(a2.id);
    const partial = await waitRun(unknownApp, (await startRun(unknownApp, a2.id)).json().id);
    expect(partial.status).toBe('completed');
    expect(partial.cost_usd).toBeNull();
    expect(partial.results.filter((r) => r.cost_usd === null)).toHaveLength(1);
  });

  it('a provider failure on the second of three cases stores failed, an error naming that case and the cause, null metrics and no results, after exactly two provider calls', async () => {
    const llm = new FailingLLM(2, 'provider exploded');
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id, { name: 'alpha' });
    await mkCase(agent.id, { name: 'beta' });
    await mkCase(agent.id, { name: 'gamma' });

    const res = await startRun(app, agent.id);
    const detail = await waitRun(app, res.json().id);

    expect(detail.status).toBe('failed');
    expect(detail.error).toBe('Case "beta": provider exploded');
    expect(detail.recall).toBeNull();
    expect(detail.precision).toBeNull();
    expect(detail.citation_accuracy).toBeNull();
    expect(detail.traces_passed).toBeNull();
    expect(detail.cost_usd).toBeNull();
    expect(detail.results).toEqual([]);
    const stored = await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, detail.id));
    expect(stored).toEqual([]);
    expect(completeStructuredCalls(llm)).toHaveLength(2);
    // nothing runs after the failure
    await new Promise((r) => setTimeout(r, 100));
    expect(completeStructuredCalls(llm)).toHaveLength(2);
  });

  it('a stored error is cut at 500 characters', async () => {
    const llm = new FailingLLM(1, 'x'.repeat(900));
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id, { name: 'only' });
    const detail = await waitRun(app, (await startRun(app, agent.id)).json().id);
    expect(detail.status).toBe('failed');
    expect(detail.error).toHaveLength(500);
    expect(detail.error!.startsWith('Case "only": xxx')).toBe(true);
  });

  it('an agent with no cases is 409 no_eval_cases and stores no run', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_eval_cases');
    expect(await runRows(agent.id)).toHaveLength(0);
    expect(llm.calls).toEqual([]);
  });

  it('a request while a run is running is 409 eval_run_in_progress and stores no run', async () => {
    const llm = new GatedLLM();
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id);
    let first: string;
    try {
      const res = await startRun(app, agent.id);
      expect(res.statusCode).toBe(201);
      first = res.json().id;
      const second = await startRun(app, agent.id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('eval_run_in_progress');
      expect(await runRows(agent.id)).toHaveLength(1);
    } finally {
      llm.release();
    }
    expect((await waitRun(app, first!)).status).toBe('completed');
    // once the run is over a new one is accepted
    const third = await startRun(app, agent.id);
    expect(third.statusCode).toBe(201);
    await waitRun(app, third.json().id);
    expect(await runRows(agent.id)).toHaveLength(2);
  });

  it('building the app marks a run left running as failed with the interrupted error', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id);
    const stale = await mkRun(agent.id, {
      status: 'running',
      tracesPassed: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: null,
    });
    const done = await mkRun(agent.id, { status: 'completed' });

    const app = await makeApp({ openai: new MockLLMProvider('openai', { structured: REVIEW }) });

    const reaped = (await getRun(app, stale.id)).json();
    expect(reaped.status).toBe('failed');
    expect(reaped.error).toBe(EVAL_RUN_INTERRUPTED);
    expect(reaped.error).toMatch(/interrupted/i);
    const untouched = (await getRun(app, done.id)).json();
    expect(untouched.status).toBe('completed');
    expect(untouched.error).toBeNull();
  });

  it('a run over N cases records exactly N completeStructured calls and no other provider call', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    for (let i = 0; i < 4; i++) await mkCase(agent.id);
    const detail = await waitRun(app, (await startRun(app, agent.id)).json().id);
    expect(detail.status).toBe('completed');
    expect(completeStructuredCalls(llm)).toHaveLength(4);
    expect(llm.calls).toHaveLength(4);
  });

  it('the 11th run request in a minute is 429', async () => {
    const app = await makeApp(
      { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      { NODE_ENV: 'production' },
    );
    const unknown = '00000000-0000-4000-8000-0000000000aa';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await startRun(app, unknown)).statusCode);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(404));
    expect(statuses[10]).toBe(429);
  });

  it('GET /agents/:id/evals returns the 20 newest runs newest first, the 20 newest completed runs oldest first, both counts, and each case\'s last result from the newest completed run that included it', async () => {
    const app = await makeApp({ openai: new MockLLMProvider('openai', { structured: REVIEW }) });
    const agent = await mkAgent();
    const x = await mkCase(agent.id, { name: 'x-case' });
    const y = await mkCase(agent.id, { name: 'y-case' });
    const z = await mkCase(agent.id, { name: 'z-case' });
    const day = (i: number) => new Date(Date.UTC(2020, 0, 1 + i));
    const completed = [];
    for (let i = 0; i < 25; i++) {
      completed.push(await mkRun(agent.id, { ranAt: day(i), recall: i / 100, agentVersion: i + 1 }));
    }
    const failed = await mkRun(agent.id, { status: 'failed', ranAt: day(25), error: 'boom', recall: null, tracesPassed: null });

    const result = (runId: string, caseId: string, name: string, matched: number, pass: boolean) => ({
      runId, caseId, caseName: name, expectationType: 'must_find' as const, pass, matched,
      unjudged: 0, kept: matched, dropped: 0, findings: [], durationMs: 5, costUsd: null,
    });
    await db().insert(t.evalCaseResults).values([
      result(completed[24]!.id, x.id, 'x-case', 7, false),
      result(completed[23]!.id, x.id, 'x-case', 3, true),
      result(completed[3]!.id, y.id, 'y-case', 4, true),
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` });
    expect(res.statusCode).toBe(200);
    const overview = AgentEvalOverview.parse(res.json());

    expect(overview.runs_total).toBe(26);
    expect(overview.runs.map((r) => r.id)).toEqual(
      [failed, ...completed.slice(6).reverse()].map((r) => r.id),
    );
    expect(overview.runs).toHaveLength(20);
    expect(overview.trend.map((p) => p.run_id)).toEqual(completed.slice(5).map((r) => r.id));
    expect(overview.trend.map((p) => p.agent_version)).toEqual(completed.slice(5).map((_, k) => k + 6));
    expect(overview.trend.map((p) => p.recall)).toEqual(completed.slice(5).map((_, k) => (k + 5) / 100));
    expect(overview.cases_total).toBe(3);

    const last = (id: string) => overview.cases.find((c) => c.id === id)!.last_result;
    expect(last(x.id)).toMatchObject({ matched: 7, pass: false });
    expect(last(y.id)).toMatchObject({ matched: 4, pass: true });
    expect(last(z.id)).toBeNull();
  });

  it('GET /eval-runs/:id returns the stored run with its case results', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent({ systemPrompt: 'DETAIL-PROMPT' });
    const hit = await mkCase(agent.id, { name: 'hit', file: 'src/a.ts' });
    const miss = await mkCase(agent.id, { name: 'miss', file: 'src/c.ts' });
    const runId = (await startRun(app, agent.id)).json().id;
    await waitRun(app, runId);

    const res = await getRun(app, runId);
    expect(res.statusCode).toBe(200);
    const detail = EvalRunDetail.parse(res.json());
    const [row] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, runId));
    expect(detail).toMatchObject({
      id: runId,
      agent_id: agent.id,
      status: 'completed',
      system_prompt: 'DETAIL-PROMPT',
      traces_total: 2,
      traces_passed: 1,
      recall: row!.recall,
    });
    expect(detail.results.map((r) => r.case_id).sort()).toEqual([hit.id, miss.id].sort());
    const byId = new Map(detail.results.map((r) => [r.case_id, r]));
    expect(byId.get(hit.id)).toMatchObject({ case_name: 'hit', pass: true, matched: 1, kept: 1, dropped: 0 });
    expect(byId.get(hit.id)!.findings).toEqual([
      { file: 'src/a.ts', start_line: 2, end_line: 2, title: 'Suspicious import', severity: 'WARNING', category: 'bug' },
    ]);
    expect(byId.get(miss.id)).toMatchObject({ case_name: 'miss', pass: false, matched: 0, kept: 0, dropped: 1 });
  });

  it("deleting a case leaves every stored run's metrics, totals, cost and results unchanged, the deleted case's result included", async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    const alpha = await mkCase(agent.id, { name: 'alpha', file: 'src/a.ts' });
    await mkCase(agent.id, { name: 'beta', file: 'src/c.ts' });
    const runId = (await startRun(app, agent.id)).json().id;
    const before = await waitRun(app, runId);
    expect(before.status).toBe('completed');
    expect(before.results).toHaveLength(2);

    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${alpha.id}` });
    expect(del.statusCode).toBe(200);

    const after = (await getRun(app, runId)).json();
    expect(after).toEqual(before);
    const kept = after.results.find((r: { case_id: string }) => r.case_id === alpha.id);
    expect(kept).toMatchObject({ case_id: alpha.id, case_name: 'alpha', pass: true });
    const overview = AgentEvalOverview.parse(
      (await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` })).json(),
    );
    expect(overview.runs[0]).toMatchObject({
      traces_passed: before.traces_passed,
      traces_total: before.traces_total,
      cost_usd: before.cost_usd,
      recall: before.recall,
    });
  });

  it('GET /eval/dashboard lists each agent that has a case or a run with its newest completed run and up to 8 recall points oldest first; an agent with neither is absent', async () => {
    const app = await makeApp({ openai: new MockLLMProvider('openai', { structured: REVIEW }) });
    const day = (i: number) => new Date(Date.UTC(2098, 0, 1 + i));

    const many = await mkAgent({ name: 'Dash many', model: 'model-many' });
    await mkCase(many.id);
    const runs = [];
    for (let i = 0; i < 10; i++) {
      runs.push(await mkRun(many.id, { ranAt: day(i), recall: i === 5 ? null : i / 10, agentVersion: 4 }));
    }
    const caseOnly = await mkAgent({ name: 'Dash case only' });
    await mkCase(caseOnly.id);
    const runOnly = await mkAgent({ name: 'Dash run only' });
    await mkRun(runOnly.id, { status: 'failed', error: 'x', recall: null, ranAt: day(0) });
    const neither = await mkAgent({ name: 'Dash neither' });

    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    const dash = EvalDashboard.parse(res.json());
    const row = (id: string) => dash.agents.find((a) => a.id === id);

    const m = row(many.id)!;
    expect(m).toMatchObject({ name: 'Dash many', model: 'model-many', cases_total: 1 });
    expect(m.latest_run!.id).toBe(runs[9]!.id);
    expect(m.latest_run).toMatchObject({ agent_version: 4, status: 'completed' });
    expect(m.recall_trend).toEqual(runs.slice(2).map((_, k) => (k + 2 === 5 ? null : (k + 2) / 10)));
    expect(m.recall_trend).toHaveLength(8);

    expect(row(caseOnly.id)).toMatchObject({ cases_total: 1, latest_run: null, recall_trend: [] });
    expect(row(runOnly.id)).toMatchObject({ cases_total: 0, latest_run: null, recall_trend: [] });
    expect(row(neither.id)).toBeUndefined();
  });

  it('GET /eval/dashboard returns the 10 newest runs across agents, newest first, with the agent\'s name', async () => {
    const app = await makeApp({ openai: new MockLLMProvider('openai', { structured: REVIEW }) });
    const first = await mkAgent({ name: 'Recent alpha' });
    const second = await mkAgent({ name: 'Recent beta' });
    const day = (i: number) => new Date(Date.UTC(2099, 0, 1 + i));
    const made: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < 12; i++) {
      const agent = i % 2 === 0 ? first : second;
      const run = await mkRun(agent.id, { ranAt: day(i) });
      made.push({ id: run.id, name: agent.name });
    }

    const dash = EvalDashboard.parse((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json());
    const expected = made.slice(2).reverse();
    expect(dash.recent_runs).toHaveLength(10);
    expect(dash.recent_runs.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    expect(dash.recent_runs.map((r) => r.agent_name)).toEqual(expected.map((r) => r.name));
  });

  it('the three read routes record zero provider calls', async () => {
    const openai = new MockLLMProvider('openai', { structured: REVIEW });
    const anthropic = new MockLLMProvider('anthropic', { structured: REVIEW });
    const app = await makeApp({ openai, anthropic });
    const agent = await mkAgent();
    await mkCase(agent.id);
    const run = await mkRun(agent.id);

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` }),
      getRun(app, run.id),
      app.inject({ method: 'GET', url: '/eval/dashboard' }),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(openai.calls).toEqual([]);
    expect(anthropic.calls).toEqual([]);
  });

  it('every eval route answers 404 for an id of another workspace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const [foreignWs] = await db().insert(t.workspaces).values({ name: `foreign-runs-ws-${++seq}` }).returning();
    const foreignAgent = await db()
      .insert(t.agents)
      .values({ workspaceId: foreignWs!.id, name: `foreign-${seq}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning()
      .then((r) => r[0]!);
    const foreignCase = await mkCase(foreignAgent.id, { wsId: foreignWs!.id });
    const [foreignRun] = await db()
      .insert(t.evalRuns)
      .values({
        workspaceId: foreignWs!.id, agentId: foreignAgent.id, status: 'completed', agentVersion: 1,
        systemPrompt: 'p', model: 'm', provider: 'openai', tracesTotal: 1,
      })
      .returning();
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: foreignWs!.id, owner: 'f', name: `r${seq}`, fullName: `f/r${seq}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId: foreignWs!.id, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main', headSha: 'x' })
      .returning();
    await db().insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', patch: '@@ -1,2 +1,3 @@\n import a;\n+import b;\n import c;' });
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: foreignWs!.id, prId: pr!.id, agentId: foreignAgent.id, kind: 'review', verdict: 'comment', score: 80 })
      .returning();
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id, file: 'src/a.ts', startLine: 2, endLine: 2, severity: 'WARNING', category: 'bug',
        title: 'f', rationale: 'r', confidence: 0.9, acceptedAt: new Date(),
      })
      .returning();

    const attempts = [
      { method: 'GET', url: `/agents/${foreignAgent.id}/evals` },
      { method: 'POST', url: `/agents/${foreignAgent.id}/eval-runs` },
      { method: 'GET', url: `/eval-runs/${foreignRun!.id}` },
      { method: 'DELETE', url: `/eval-cases/${foreignCase.id}` },
      { method: 'POST', url: `/findings/${finding!.id}/eval-case` },
    ] as const;
    for (const a of attempts) {
      const res = await app.inject({ method: a.method, url: a.url });
      expect(res.statusCode, `${a.method} ${a.url}`).toBe(404);
    }
    // nothing was started or removed, and the dashboard does not list the foreign agent
    expect(await runRows(foreignAgent.id)).toHaveLength(1);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, foreignCase.id))).toHaveLength(1);
    const dash = EvalDashboard.parse((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json());
    expect(dash.agents.find((a) => a.id === foreignAgent.id)).toBeUndefined();
    expect(dash.recent_runs.find((r) => r.id === foreignRun!.id)).toBeUndefined();
    expect(llm.calls).toEqual([]);
  });

  it('run and read responses parse against the shared contracts', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp({ openai: llm });
    const agent = await mkAgent();
    await mkCase(agent.id);

    const started = await startRun(app, agent.id);
    expect(started.statusCode).toBe(201);
    expect(EvalRunSummary.parse(started.json())).toEqual(started.json());
    const detail = await waitRun(app, started.json().id);
    expect(EvalRunDetail.parse(detail)).toEqual(detail);

    const overview = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/evals` })).json();
    expect(AgentEvalOverview.parse(overview)).toEqual(overview);
    const dashboard = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(EvalDashboard.parse(dashboard)).toEqual(dashboard);
  });

  it('GET /agents/:id/evals and GET /eval-runs/:id are 404 for an unknown id', async () => {
    const app = await makeApp({ openai: new MockLLMProvider('openai', { structured: REVIEW }) });
    const unknown = '00000000-0000-4000-8000-0000000000bb';
    const overview = await app.inject({ method: 'GET', url: `/agents/${unknown}/evals` });
    expect(overview.statusCode).toBe(404);
    expect(overview.json().error.code).toBe('not_found');
    const run = await getRun(app, unknown);
    expect(run.statusCode).toBe(404);
    expect(run.json().error.code).toBe('not_found');
    expect((await getRun(app, 'not-a-uuid')).statusCode).toBe(422);
  });
});
