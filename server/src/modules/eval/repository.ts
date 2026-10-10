import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EvalCase, EvalCaseResult, EvalExpectation } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

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
}
