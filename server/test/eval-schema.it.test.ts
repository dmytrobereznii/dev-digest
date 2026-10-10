/**
 * Eval pipeline schema (migrations 0017/0018): eval_cases, eval_runs,
 * eval_case_results. Real Postgres via testcontainers; every row is created
 * under its own workspace so nothing depends on the seed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';

const d = (await dockerAvailable()) ? describe : describe.skip;

let pg: PgFixture | undefined;
const db = () => pg!.handle.db;

/** Message of an error plus its `cause` chain (drizzle wraps driver errors). */
function errorText(e: unknown): string {
  const parts: string[] = [];
  for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; ) {
    parts.push(String(cur.message ?? cur));
    cur = cur.cause as typeof cur;
  }
  return parts.join(' | ');
}

let seq = 0;

/** A workspace with one agent, one PR, one review and one finding. */
async function setup() {
  const n = seq++;
  const [ws] = await db().insert(t.workspaces).values({ name: `eval-schema-${n}` }).returning();
  const workspaceId = ws!.id;
  const agent = await newAgent(workspaceId, n);
  const [repo] = await db()
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name: `r${n}`, fullName: `acme/r${n}` })
    .returning();
  const [pr] = await db()
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'PR',
      author: 'a',
      branch: 'b',
      base: 'main',
      headSha: 'abc',
    })
    .returning();
  const [review] = await db()
    .insert(t.reviews)
    .values({ workspaceId, prId: pr!.id, agentId: agent.id, kind: 'review' })
    .returning();
  const finding = await newFinding(review!.id);
  return { workspaceId, agent, review: review!, finding };
}

async function newAgent(workspaceId: string, n: number) {
  const [agent] = await db()
    .insert(t.agents)
    .values({
      workspaceId,
      name: `agent-${n}-${seq++}`,
      provider: 'openai',
      model: 'gpt-x',
      systemPrompt: 'review',
    })
    .returning();
  return agent!;
}

async function newFinding(reviewId: string) {
  const [f] = await db()
    .insert(t.findings)
    .values({
      reviewId,
      file: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      severity: 'warning',
      category: 'bug',
      title: 'finding',
      rationale: 'why',
      confidence: 0.9,
    })
    .returning();
  return f!;
}

function caseValues(workspaceId: string, agentId: string, findingId: string | null, name = 'case') {
  return {
    workspaceId,
    agentId,
    name,
    findingId,
    expectationType: 'must_find' as const,
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    title: 'finding',
    severity: 'warning',
    category: 'bug',
    inputDiff: '@@ -1 +1 @@\n-a\n+b\n',
    prTitle: 'PR',
  };
}

function runValues(workspaceId: string, agentId: string, status: 'running' | 'completed' = 'completed') {
  return {
    workspaceId,
    agentId,
    status,
    agentVersion: 1,
    systemPrompt: 'review',
    model: 'gpt-x',
    provider: 'openai',
    tracesTotal: 1,
  };
}

function resultValues(runId: string, caseId: string, caseName: string) {
  return {
    runId,
    caseId,
    caseName,
    expectationType: 'must_find' as const,
    pass: true,
    matched: 1,
    unjudged: 0,
    kept: 1,
    dropped: 0,
    findings: [],
    durationMs: 10,
  };
}

d('eval schema', () => {
  beforeAll(async () => {
    pg = await startPg();
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('the migrations apply on an empty database and leave eval_cases, eval_runs and eval_case_results', async () => {
    // startPg() ran every migration on a fresh container.
    const res = await db().execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'eval\\_%'
      order by table_name`);
    const names = (res as unknown as Array<{ table_name: string }>).map((r) => r.table_name);
    expect(names).toEqual(['eval_case_results', 'eval_cases', 'eval_runs']);

    // The tables are usable through the Drizzle schema.
    const { workspaceId, agent } = await setup();
    const [c] = await db().insert(t.evalCases).values(caseValues(workspaceId, agent.id, null)).returning();
    expect(c!.id).toBeTruthy();
  });

  it('eval_cases holds one row per finding_id and many rows with a null finding_id', async () => {
    const { workspaceId, agent, finding } = await setup();

    await db().insert(t.evalCases).values(caseValues(workspaceId, agent.id, finding.id, 'first'));
    let err: unknown;
    try {
      await db().insert(t.evalCases).values(caseValues(workspaceId, agent.id, finding.id, 'second'));
    } catch (e) {
      err = e;
    }
    expect(errorText(err)).toContain('eval_cases_finding_id_unique');

    await db()
      .insert(t.evalCases)
      .values([
        caseValues(workspaceId, agent.id, null, 'n1'),
        caseValues(workspaceId, agent.id, null, 'n2'),
        caseValues(workspaceId, agent.id, null, 'n3'),
      ]);
    const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id));
    expect(rows.filter((r) => r.findingId === null)).toHaveLength(3);
    expect(rows.filter((r) => r.findingId === finding.id)).toHaveLength(1);
  });

  it('deleting a finding nulls eval_cases.finding_id and keeps the row', async () => {
    const { workspaceId, agent, finding } = await setup();
    const [c] = await db()
      .insert(t.evalCases)
      .values(caseValues(workspaceId, agent.id, finding.id, 'kept'))
      .returning();

    await db().delete(t.findings).where(eq(t.findings.id, finding.id));

    const [after] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, c!.id));
    expect(after).toBeDefined();
    expect(after!.findingId).toBeNull();
    expect(after!.inputDiff).toBe(c!.inputDiff);
    expect(after!.name).toBe('kept');
    expect(after!.expectationType).toBe('must_find');
  });

  it('a second running eval_runs row for one agent violates eval_runs_one_running', async () => {
    const { workspaceId, agent } = await setup();
    await db().insert(t.evalRuns).values(runValues(workspaceId, agent.id, 'running'));

    let err: unknown;
    try {
      await db().insert(t.evalRuns).values(runValues(workspaceId, agent.id, 'running'));
    } catch (e) {
      err = e;
    }
    expect(errorText(err)).toContain('eval_runs_one_running');

    // The index is partial: finished runs of the same agent are unrestricted,
    // and another agent may have its own running run.
    await db().insert(t.evalRuns).values([
      runValues(workspaceId, agent.id, 'completed'),
      runValues(workspaceId, agent.id, 'completed'),
    ]);
    const other = await newAgent(workspaceId, seq++);
    await db().insert(t.evalRuns).values(runValues(workspaceId, other.id, 'running'));
  });

  it('deleting an eval case keeps its eval_case_results rows', async () => {
    const { workspaceId, agent } = await setup();
    const [c] = await db()
      .insert(t.evalCases)
      .values(caseValues(workspaceId, agent.id, null, 'doomed'))
      .returning();
    const [run] = await db().insert(t.evalRuns).values(runValues(workspaceId, agent.id)).returning();
    await db().insert(t.evalCaseResults).values(resultValues(run!.id, c!.id, 'doomed'));

    await db().delete(t.evalCases).where(eq(t.evalCases.id, c!.id));

    const rows = await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.caseId).toBe(c!.id);
    expect(rows[0]!.caseName).toBe('doomed');
  });

  it('deleting an agent deletes its cases, runs and results', async () => {
    const { workspaceId, agent, finding } = await setup();
    const [c] = await db()
      .insert(t.evalCases)
      .values(caseValues(workspaceId, agent.id, finding.id))
      .returning();
    const [run] = await db().insert(t.evalRuns).values(runValues(workspaceId, agent.id)).returning();
    await db().insert(t.evalCaseResults).values(resultValues(run!.id, c!.id, 'case'));

    // A different agent's rows must survive.
    const other = await newAgent(workspaceId, seq++);
    const [otherCase] = await db()
      .insert(t.evalCases)
      .values(caseValues(workspaceId, other.id, null, 'other'))
      .returning();
    const [otherRun] = await db().insert(t.evalRuns).values(runValues(workspaceId, other.id)).returning();
    await db().insert(t.evalCaseResults).values(resultValues(otherRun!.id, otherCase!.id, 'other'));

    await db().delete(t.agents).where(eq(t.agents.id, agent.id));

    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, c!.id))).toHaveLength(0);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run!.id))).toHaveLength(0);
    expect(
      await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run!.id)),
    ).toHaveLength(0);

    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, otherCase!.id))).toHaveLength(1);
    expect(
      await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, otherRun!.id)),
    ).toHaveLength(1);
  });
});
