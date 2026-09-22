import { and, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as t from '../schema.js';
import type { DemoPr } from './types.js';

/** Everything a fixture needs that is resolved once, outside the loop. */
export interface SeedPrContext {
  workspaceId: string;
  repoId: string;
  provider: string;
  model: string;
  /** Built-in agent id by name, so a fixture can name its reviewer as data. */
  agentIdByName: Map<string, string>;
}

const DAY_MS = 86_400_000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

/**
 * Write one demo PR: the PR row, its files and commits, and — when the fixture
 * carries one — a review with findings plus the agent run and trace behind it.
 *
 * Idempotent, and reconciling where it matters:
 *  - the PR row's mutable fields are re-applied every run, so a fixture edit
 *    (or a relative date that has drifted) lands without a DB reset;
 *  - files are matched by path and refreshed, mirroring how the demo PR's own
 *    patches are reconciled in `seed.ts`;
 *  - commits and the review/findings/run block are written ONCE — re-running
 *    must not duplicate findings or double the PR's total spend.
 */
export async function seedDemoPr(db: Db, ctx: SeedPrContext, fx: DemoPr): Promise<void> {
  const { workspaceId, repoId } = ctx;

  const mutable = {
    title: fx.title,
    author: fx.author,
    branch: fx.branch,
    base: fx.base,
    headSha: fx.headSha,
    lastReviewedSha: fx.lastReviewedSha,
    additions: fx.additions,
    deletions: fx.deletions,
    filesCount: fx.filesCount,
    status: fx.ghStatus,
    body: fx.body,
    openedAt: daysAgo(fx.openedDaysAgo),
    updatedAt: daysAgo(fx.updatedDaysAgo),
  };

  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, fx.number)));

  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId, number: fx.number, ...mutable })
      .returning();
  } else {
    await db.update(t.pullRequests).set(mutable).where(eq(t.pullRequests.id, pr.id));
  }
  const prId = pr!.id;

  // ---- files: insert what is missing, refresh what is there ----
  for (const f of fx.files) {
    const [existing] = await db
      .select()
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, f.path)));
    if (existing) {
      await db
        .update(t.prFiles)
        .set({ additions: f.additions, deletions: f.deletions, patch: f.patch })
        .where(eq(t.prFiles.id, existing.id));
    } else {
      await db.insert(t.prFiles).values({ prId, ...f });
    }
  }

  // ---- commits: write-once ----
  const existingCommits = await db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  if (existingCommits.length === 0 && fx.commits.length > 0) {
    await db.insert(t.prCommits).values(
      fx.commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: daysAgo(fx.updatedDaysAgo),
      })),
    );
  }

  if (!fx.review) return;

  // ---- review + findings + run: write-once, keyed on the seed marker ----
  const [existingReview] = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, prId), eq(t.reviews.model, 'seed')));
  if (existingReview) return;

  const rv = fx.review;
  const agentId = ctx.agentIdByName.get(rv.agent) ?? null;

  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId,
      prId,
      agentId,
      ranAt: daysAgo(fx.updatedDaysAgo),
      provider: ctx.provider,
      model: ctx.model,
      durationMs: rv.run.durationMs,
      tokensIn: rv.run.tokensIn,
      tokensOut: rv.run.tokensOut,
      costUsd: rv.run.costUsd,
      status: 'done',
      source: 'local',
      findingsCount: rv.findings.length,
      grounding: rv.run.grounding,
      score: rv.score,
      blockers: rv.run.blockers,
    })
    .returning();

  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId,
      runId: run!.id,
      kind: 'review',
      verdict: rv.verdict,
      summary: rv.summary,
      score: rv.score,
      model: 'seed',
    })
    .returning();

  if (rv.findings.length > 0) {
    await db.insert(t.findings).values(
      rv.findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine,
        severity: f.severity,
        category: f.category,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
        kind: f.kind ?? 'finding',
      })),
    );
  }

  await db.insert(t.runTraces).values({
    runId: run!.id,
    trace: {
      config: {
        agent: rv.agent,
        version: '1',
        provider: ctx.provider,
        model: ctx.model,
        pr: fx.number,
        source: 'local',
      },
      stats: {
        duration_ms: rv.run.durationMs,
        tokens_in: rv.run.tokensIn,
        tokens_out: rv.run.tokensOut,
        cost_usd: rv.run.costUsd,
        findings: rv.findings.length,
        grounding: rv.run.grounding,
      },
      prompt_assembly: {
        system: `You are ${rv.agent}.`,
        skills: null,
        memory: null,
        specs: null,
        user: `Review pull request #${fx.number} "${fx.title}".`,
      },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [{ t: '00.00', kind: 'info', msg: 'Seeded run (no LLM call was made)' }],
    },
  });
}
