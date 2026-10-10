import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  EvalCase,
  EvalCaseResult,
  EvalDashboard,
  EvalExpectation,
  EvalRunDetail,
  EvalRunSummary,
  EvalTrendPoint,
  Provider,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { AgentRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { DASHBOARD_RECENT_RUNS, DASHBOARD_TREND_POINTS } from './constants.js';

/**
 * Eval data-access. The only layer touching the DB for the eval domain; maps
 * rows to the shared contracts itself (a repository returns DTO shapes).
 * Everything is scoped by workspace.
 */

type CaseRow = typeof t.evalCases.$inferSelect;
type ResultRow = typeof t.evalCaseResults.$inferSelect;

export interface NewEvalCase {
  workspaceId: string;
  agentId: string;
  name: string;
  findingId: string;
  expectation: EvalExpectation;
  inputDiff: string;
  prTitle: string;
  prDescription: string | null;
}

type RunRow = typeof t.evalRuns.$inferSelect;

/** What the executor stores when a run completes. */
export interface CompletedRunValues {
  results: EvalCaseResult[];
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  tracesPassed: number;
  costUsd: number | null;
  durationMs: number;
}

export type CreateRunOutcome =
  | { kind: 'created'; run: EvalRunSummary; agent: AgentRow; cases: EvalCase[] }
  | { kind: 'agent_not_found' }
  | { kind: 'no_cases' }
  | { kind: 'in_progress' };

export type DeleteCaseOutcome = 'deleted' | 'not_found' | 'run_in_progress';

function resultRowToDto(r: ResultRow): EvalCaseResult {
  return {
    case_id: r.caseId,
    case_name: r.caseName,
    expectation_type: r.expectationType,
    pass: r.pass,
    matched: r.matched,
    unjudged: r.unjudged,
    kept: r.kept,
    dropped: r.dropped,
    findings: r.findings as EvalCaseResult['findings'],
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
  };
}

function runRowToSummary(r: RunRow): EvalRunSummary {
  return {
    id: r.id,
    agent_id: r.agentId,
    status: r.status,
    ran_at: r.ranAt.toISOString(),
    duration_ms: r.durationMs,
    agent_version: r.agentVersion,
    model: r.model,
    provider: r.provider as Provider,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    traces_passed: r.tracesPassed,
    traces_total: r.tracesTotal,
    cost_usd: r.costUsd,
    error: r.error,
  };
}

function caseRowToDto(row: CaseRow, lastResult: EvalCaseResult | null): EvalCase {
  return {
    id: row.id,
    owner_kind: 'agent',
    owner_id: row.agentId,
    name: row.name,
    finding_id: row.findingId,
    input_diff: row.inputDiff,
    input_meta: { pr_title: row.prTitle, pr_description: row.prDescription },
    expected_output: {
      type: row.expectationType,
      file: row.file,
      start_line: row.startLine,
      end_line: row.endLine,
      title: row.title,
      severity: row.severity as EvalExpectation['severity'],
      category: row.category as EvalExpectation['category'],
    },
    created_at: row.createdAt.toISOString(),
    last_result: lastResult,
  };
}

export class EvalRepository {
  constructor(private db: Db) {}

  /** Each case's result from the newest completed run that included it. */
  private async lastResults(caseIds: string[]): Promise<Map<string, EvalCaseResult>> {
    const out = new Map<string, EvalCaseResult>();
    if (caseIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.evalCaseResults.caseId], { result: t.evalCaseResults })
      .from(t.evalCaseResults)
      .innerJoin(t.evalRuns, eq(t.evalRuns.id, t.evalCaseResults.runId))
      .where(and(inArray(t.evalCaseResults.caseId, caseIds), eq(t.evalRuns.status, 'completed')))
      .orderBy(t.evalCaseResults.caseId, desc(t.evalRuns.ranAt));
    for (const { result } of rows) out.set(result.caseId, resultRowToDto(result));
    return out;
  }

  private async withLastResults(rows: CaseRow[]): Promise<EvalCase[]> {
    const last = await this.lastResults(rows.map((r) => r.id));
    return rows.map((r) => caseRowToDto(r, last.get(r.id) ?? null));
  }

  /** The case made from a finding, if any (workspace-scoped). */
  async getCaseByFinding(workspaceId: string, findingId: string): Promise<EvalCase | undefined> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.findingId, findingId)));
    return (await this.withLastResults(rows))[0];
  }

  /**
   * Insert a case; a concurrent or repeated request for the same finding
   * loses to the unique index and gets the existing case back.
   */
  async insertCaseIfAbsent(values: NewEvalCase): Promise<{ case: EvalCase; created: boolean }> {
    const e = values.expectation;
    const inserted = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        name: values.name,
        findingId: values.findingId,
        expectationType: e.type,
        file: e.file,
        startLine: e.start_line,
        endLine: e.end_line,
        title: e.title,
        severity: e.severity,
        category: e.category,
        inputDiff: values.inputDiff,
        prTitle: values.prTitle,
        prDescription: values.prDescription,
      })
      .onConflictDoNothing({ target: t.evalCases.findingId })
      .returning();
    if (inserted[0]) return { case: caseRowToDto(inserted[0], null), created: true };
    const existing = await this.getCaseByFinding(values.workspaceId, values.findingId);
    return { case: existing!, created: false };
  }

  /** Every case of an agent, oldest first, with its last completed result. */
  async listCasesByAgent(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
      .orderBy(t.evalCases.createdAt, t.evalCases.id);
    return this.withLastResults(rows);
  }

  async countCasesByAgent(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)));
    return row?.n ?? 0;
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return (await this.withLastResults(rows))[0];
  }

  /**
   * Delete a case unless its agent has a running run. Check and delete share
   * one transaction that holds the agent row, so a run cannot start between
   * them. Past results keep their rows (no FK on `case_id`).
   */
  async deleteCaseUnlessRunning(workspaceId: string, caseId: string): Promise<DeleteCaseOutcome> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ agentId: t.evalCases.agentId })
        .from(t.evalCases)
        .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
      if (!row) return 'not_found';
      await tx.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.id, row.agentId)).for('update');
      const running = await tx
        .select({ id: t.evalRuns.id })
        .from(t.evalRuns)
        .where(and(eq(t.evalRuns.agentId, row.agentId), eq(t.evalRuns.status, 'running')))
        .limit(1);
      if (running.length > 0) return 'run_in_progress';
      const gone = await tx
        .delete(t.evalCases)
        .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
        .returning({ id: t.evalCases.id });
      return gone.length > 0 ? 'deleted' : 'not_found';
    });
  }

  // ---- runs ---------------------------------------------------------------

  /**
   * Create a run with the agent's config and the case set frozen at this
   * moment. The agent row is locked for the transaction (as case deletion
   * does), so the "one running run" check and a case delete cannot interleave.
   */
  async createRun(workspaceId: string, agentId: string): Promise<CreateRunOutcome> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .for('update');
      if (!agent) return { kind: 'agent_not_found' } as const;

      const caseRows = await tx
        .select()
        .from(t.evalCases)
        .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
        .orderBy(t.evalCases.createdAt, t.evalCases.id);
      if (caseRows.length === 0) return { kind: 'no_cases' } as const;

      const running = await tx
        .select({ id: t.evalRuns.id })
        .from(t.evalRuns)
        .where(and(eq(t.evalRuns.agentId, agentId), eq(t.evalRuns.status, 'running')))
        .limit(1);
      if (running.length > 0) return { kind: 'in_progress' } as const;

      const [run] = await tx
        .insert(t.evalRuns)
        .values({
          workspaceId,
          agentId,
          status: 'running',
          agentVersion: agent.version,
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          provider: agent.provider,
          tracesTotal: caseRows.length,
        })
        .returning();
      return {
        kind: 'created',
        run: runRowToSummary(run!),
        agent,
        cases: caseRows.map((r) => caseRowToDto(r, null)),
      } as const;
    });
  }

  /** Store every case result and close the run as completed, in one transaction. */
  async completeRun(runId: string, v: CompletedRunValues): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (v.results.length > 0) {
        await tx.insert(t.evalCaseResults).values(
          v.results.map((r) => ({
            runId,
            caseId: r.case_id,
            caseName: r.case_name,
            expectationType: r.expectation_type,
            pass: r.pass,
            matched: r.matched,
            unjudged: r.unjudged,
            kept: r.kept,
            dropped: r.dropped,
            findings: r.findings,
            durationMs: r.duration_ms,
            costUsd: r.cost_usd,
          })),
        );
      }
      await tx
        .update(t.evalRuns)
        .set({
          status: 'completed',
          recall: v.recall,
          precision: v.precision,
          citationAccuracy: v.citationAccuracy,
          tracesPassed: v.tracesPassed,
          costUsd: v.costUsd,
          durationMs: v.durationMs,
          error: null,
        })
        .where(and(eq(t.evalRuns.id, runId), eq(t.evalRuns.status, 'running')));
    });
  }

  /** Close a run as failed: no metrics, no results. */
  async failRun(runId: string, error: string): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ status: 'failed', error })
      .where(and(eq(t.evalRuns.id, runId), eq(t.evalRuns.status, 'running')));
  }

  /** Boot reaper: every run left `running` by a dead process becomes `failed`. */
  async failRunningRuns(error: string): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'failed', error })
      .where(eq(t.evalRuns.status, 'running'))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  /** An agent's newest runs, any status, newest first. */
  async listRunsByAgent(workspaceId: string, agentId: string, limit: number): Promise<EvalRunSummary[]> {
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId)))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows.map(runRowToSummary);
  }

  async countRunsByAgent(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId)));
    return row?.n ?? 0;
  }

  /** An agent's newest completed runs as trend points, oldest first. */
  async trendByAgent(workspaceId: string, agentId: string, limit: number): Promise<EvalTrendPoint[]> {
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.agentId, agentId),
          eq(t.evalRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows.reverse().map((r) => ({
      run_id: r.id,
      ran_at: r.ranAt.toISOString(),
      agent_version: r.agentVersion,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
    }));
  }

  /** One run with its prompt and its stored case results (workspace-scoped). */
  async getRunDetail(workspaceId: string, runId: string): Promise<EvalRunDetail | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.id, runId)));
    if (!row) return undefined;
    const results = await this.db
      .select()
      .from(t.evalCaseResults)
      .where(eq(t.evalCaseResults.runId, runId))
      .orderBy(t.evalCaseResults.caseName, t.evalCaseResults.caseId);
    return {
      ...runRowToSummary(row),
      system_prompt: row.systemPrompt,
      results: results.map(resultRowToDto),
    };
  }

  /**
   * All-agents read model: agents with at least one case or one run, each with
   * its newest completed run and recall trend, plus the newest runs overall.
   */
  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const agents = await this.db
      .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model, version: t.agents.version })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(t.agents.name, t.agents.id);
    const caseCounts = await this.db
      .select({ agentId: t.evalCases.agentId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(eq(t.evalCases.workspaceId, workspaceId))
      .groupBy(t.evalCases.agentId);
    const runCounts = await this.db
      .select({ agentId: t.evalRuns.agentId, n: sql<number>`count(*)::int` })
      .from(t.evalRuns)
      .where(eq(t.evalRuns.workspaceId, workspaceId))
      .groupBy(t.evalRuns.agentId);
    const cases = new Map(caseCounts.map((c) => [c.agentId, c.n]));
    const runs = new Map(runCounts.map((c) => [c.agentId, c.n]));

    const listed = agents.filter((a) => (cases.get(a.id) ?? 0) > 0 || (runs.get(a.id) ?? 0) > 0);
    const rows = await Promise.all(
      listed.map(async (a) => {
        const completed = await this.db
          .select()
          .from(t.evalRuns)
          .where(and(eq(t.evalRuns.agentId, a.id), eq(t.evalRuns.status, 'completed')))
          .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
          .limit(DASHBOARD_TREND_POINTS);
        return {
          id: a.id,
          name: a.name,
          model: a.model,
          version: a.version,
          cases_total: cases.get(a.id) ?? 0,
          latest_run: completed[0] ? runRowToSummary(completed[0]) : null,
          recall_trend: completed.map((r) => r.recall).reverse(),
        };
      }),
    );

    const recent = await this.db
      .select({ run: t.evalRuns, agentName: t.agents.name })
      .from(t.evalRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalRuns.agentId))
      .where(eq(t.evalRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(DASHBOARD_RECENT_RUNS);

    return {
      agents: rows,
      recent_runs: recent.map((r) => ({ ...runRowToSummary(r.run), agent_name: r.agentName })),
    };
  }
}
