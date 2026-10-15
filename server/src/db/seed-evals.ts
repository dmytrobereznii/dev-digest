import { and, eq, isNull } from 'drizzle-orm';
import type { EvalCaseResult, Provider } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';
import { USERS_PATCH, WEBHOOKS_PATCH } from './seed-diffs.js';

/**
 * L06 eval-pipeline seed — one disabled agent, "Eval Demo Reviewer", that owns
 * the demo eval data, so the Evals tab, the dashboard and the compare view have
 * something to show on first boot (spec D19).
 *
 * The agent is its own row because General Reviewer is the user's experiment
 * and no built-in agent has two versions. It is written ONLY while it is absent
 * (same rule as `seed-skills`), so a user who deletes a case or a run is not
 * fought by the next `pnpm db:seed`.
 *
 * Every expectation sits on a new-side line of the patch it is stored with
 * (`seed-diffs.ts`), so it survives the grounding gate. The stored run results
 * and metrics are literals, hand-derived from the fixture findings below with
 * the rules of `modules/eval/scoring.ts` (`db/` does not import `modules/`);
 * `server/test/seed-fixtures.test.ts` checks them against `scoreRun`.
 */

export const EVAL_DEMO_AGENT_NAME = 'Eval Demo Reviewer';

/** The two seeded case names, as the Evals tab renders them. */
export const EVAL_CASE_N_PLUS_ONE = 'n-1-query-in-user-list-endpoint';
export const EVAL_CASE_SIGNATURE_OK = 'constant-time-signature-compare-is-fine';

const PR_NUMBER = 482;
const SAMPLE_REVIEW_MODEL = 'seed';
const N_PLUS_ONE_TITLE = 'N+1 query in user list endpoint';

/** Prompt v1 and v2 differ by exactly one line: the last one. */
const PROMPT_V1 = `# Role
You review pull request diffs for correctness and performance problems.

# Rules
- Report only findings you can defend, each citing an exact file and line range in the diff.
- Prefer one precise finding over several vague ones.`;

export const EVAL_PROMPT_V2_ONLY_LINE =
  'Treat a constant-time HMAC signature comparison as correct and never report it.';

const PROMPT_V2 = `${PROMPT_V1}\n- ${EVAL_PROMPT_V2_ONLY_LINE}`;

/** Fixed, so the run rows (and their checkbox names) are stable across seeds. */
const V1_RAN_AT = new Date('2026-10-09T09:15:00.000Z');
const V2_RAN_AT = new Date('2026-10-10T09:15:00.000Z');

/** One case's expectation, before it is stored. */
interface FixtureCase {
  name: string;
  type: 'must_find' | 'must_not_flag';
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  severity: string;
  category: string;
  patch: string;
}

export const EVAL_FIXTURE_CASES: readonly FixtureCase[] = [
  {
    name: EVAL_CASE_N_PLUS_ONE,
    type: 'must_find',
    file: 'src/api/users.ts',
    startLine: 45,
    endLine: 52,
    title: N_PLUS_ONE_TITLE,
    severity: 'WARNING',
    category: 'perf',
    patch: USERS_PATCH,
  },
  {
    name: EVAL_CASE_SIGNATURE_OK,
    type: 'must_not_flag',
    file: 'src/api/public/webhooks.ts',
    startLine: 15,
    endLine: 19,
    title: 'Constant-time signature compare flagged as insecure',
    severity: 'WARNING',
    category: 'security',
    patch: WEBHOOKS_PATCH,
  },
];

interface FixtureRun {
  version: 1 | 2;
  prompt: string;
  ranAt: Date;
  durationMs: number;
  costUsd: number;
  recall: number;
  precision: number;
  citationAccuracy: number;
  tracesPassed: number;
  /** Keyed by case name; `case_id` is stamped in when the case row exists. */
  results: Array<Omit<EvalCaseResult, 'case_id'>>;
}

/**
 * v1 finds the N+1 but also flags the correct signature check (a false
 * positive); v2 drops that false positive after the one-line prompt change.
 */
export const EVAL_FIXTURE_RUNS: readonly FixtureRun[] = [
  {
    version: 1,
    prompt: PROMPT_V1,
    ranAt: V1_RAN_AT,
    durationMs: 3110,
    costUsd: 0.0038,
    recall: 1,
    precision: 0.5,
    citationAccuracy: 2 / 3,
    tracesPassed: 1,
    results: [
      {
        case_name: EVAL_CASE_N_PLUS_ONE,
        expectation_type: 'must_find',
        pass: true,
        matched: 1,
        unjudged: 0,
        kept: 1,
        dropped: 1,
        findings: [
          {
            file: 'src/api/users.ts',
            start_line: 46,
            end_line: 48,
            title: 'Queries issued inside the user loop',
            severity: 'WARNING',
            category: 'perf',
          },
        ],
        duration_ms: 1840,
        cost_usd: 0.0021,
      },
      {
        case_name: EVAL_CASE_SIGNATURE_OK,
        expectation_type: 'must_not_flag',
        pass: false,
        matched: 1,
        unjudged: 0,
        kept: 1,
        dropped: 0,
        findings: [
          {
            file: 'src/api/public/webhooks.ts',
            start_line: 17,
            end_line: 18,
            title: 'HMAC is built from the secret key',
            severity: 'WARNING',
            category: 'security',
          },
        ],
        duration_ms: 1270,
        cost_usd: 0.0017,
      },
    ],
  },
  {
    version: 2,
    prompt: PROMPT_V2,
    ranAt: V2_RAN_AT,
    durationMs: 3340,
    costUsd: 0.0035,
    recall: 1,
    precision: 1,
    citationAccuracy: 1,
    tracesPassed: 2,
    results: [
      {
        case_name: EVAL_CASE_N_PLUS_ONE,
        expectation_type: 'must_find',
        pass: true,
        matched: 1,
        unjudged: 0,
        kept: 1,
        dropped: 0,
        findings: [
          {
            file: 'src/api/users.ts',
            start_line: 45,
            end_line: 52,
            title: N_PLUS_ONE_TITLE,
            severity: 'WARNING',
            category: 'perf',
          },
        ],
        duration_ms: 2010,
        cost_usd: 0.0019,
      },
      {
        case_name: EVAL_CASE_SIGNATURE_OK,
        expectation_type: 'must_not_flag',
        pass: true,
        matched: 0,
        unjudged: 0,
        kept: 0,
        dropped: 0,
        findings: [],
        duration_ms: 1330,
        cost_usd: 0.0016,
      },
    ],
  },
];

/** One file's stored patch under its two header lines, as an eval case stores it. */
export function evalCaseInputDiff(file: string, patch: string): string {
  return `--- a/${file}\n+++ b/${file}\n${patch}`;
}

/**
 * Idempotent. Writes the demo agent with its cases and runs only while the
 * agent is absent. Separately, gives the #482 sample review the agent if it has
 * none, and accepts its two findings once, on the run that creates the agent,
 * only a finding nobody has decided, so a user's decision is never touched.
 * The Stripe finding gets no case, so flow 17 can create it.
 */
export async function seedEvals(
  db: Db,
  args: { workspaceId: string; userId: string; repoId: string; provider: Provider; model: string },
): Promise<void> {
  const { workspaceId, userId, repoId, provider, model } = args;

  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, PR_NUMBER)));
  if (!pr) return;

  const [review] = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, pr.id), eq(t.reviews.model, SAMPLE_REVIEW_MODEL)));
  const sampleFindings = review
    ? await db.select().from(t.findings).where(eq(t.findings.reviewId, review.id))
    : [];

  let [agent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, EVAL_DEMO_AGENT_NAME)));

  const createdAgent = !agent;
  if (!agent) {
    await db.transaction(async (tx) => {
      [agent] = await tx
        .insert(t.agents)
        .values({
          workspaceId,
          name: EVAL_DEMO_AGENT_NAME,
          description: 'Demo agent that owns the seeded eval cases and runs.',
          provider,
          model,
          systemPrompt: PROMPT_V2,
          enabled: false,
          version: 2,
          createdBy: userId,
        })
        .returning();
      const agentId = agent!.id;

      for (const run of EVAL_FIXTURE_RUNS) {
        await tx.insert(t.agentVersions).values({
          agentId,
          version: run.version,
          configJson: {
            provider,
            model,
            system_prompt: run.prompt,
            output_schema: agent!.outputSchema,
            strategy: agent!.strategy,
            ci_fail_on: agent!.ciFailOn,
            repo_intel: agent!.repoIntel,
            skills: [],
          },
        });
      }

      const caseIdByName = new Map<string, string>();
      for (const c of EVAL_FIXTURE_CASES) {
        // Only the N+1 case is linked to a seeded finding; the other has none.
        const linked =
          c.name === EVAL_CASE_N_PLUS_ONE
            ? sampleFindings.find((f) => f.title === N_PLUS_ONE_TITLE)
            : undefined;
        const [row] = await tx
          .insert(t.evalCases)
          .values({
            workspaceId,
            agentId,
            name: c.name,
            findingId: linked?.id ?? null,
            expectationType: c.type,
            file: c.file,
            startLine: c.startLine,
            endLine: c.endLine,
            title: c.title,
            severity: c.severity,
            category: c.category,
            inputDiff: evalCaseInputDiff(c.file, c.patch),
            prTitle: pr.title,
            prDescription: pr.body ?? null,
          })
          .returning();
        caseIdByName.set(c.name, row!.id);
      }

      for (const run of EVAL_FIXTURE_RUNS) {
        const [row] = await tx
          .insert(t.evalRuns)
          .values({
            workspaceId,
            agentId,
            status: 'completed',
            ranAt: run.ranAt,
            durationMs: run.durationMs,
            agentVersion: run.version,
            systemPrompt: run.prompt,
            model,
            provider,
            recall: run.recall,
            precision: run.precision,
            citationAccuracy: run.citationAccuracy,
            tracesPassed: run.tracesPassed,
            tracesTotal: run.results.length,
            costUsd: run.costUsd,
          })
          .returning();
        await tx.insert(t.evalCaseResults).values(
          run.results.map((r) => ({
            runId: row!.id,
            caseId: caseIdByName.get(r.case_name)!,
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
    });
  }

  // The review gets this agent only if it has none (seed.ts may have given it
  // one already).
  if (review && !review.agentId && agent) {
    await db.update(t.reviews).set({ agentId: agent.id }).where(eq(t.reviews.id, review.id));
  }

  // The accept happens once, on the run that creates the fixture agent, so a
  // finding the user later un-decides or dismisses is not redone.
  if (review && createdAgent) {
    for (const f of sampleFindings) {
      await db
        .update(t.findings)
        .set({ acceptedAt: new Date() })
        .where(
          and(eq(t.findings.id, f.id), isNull(t.findings.acceptedAt), isNull(t.findings.dismissedAt)),
        );
    }
  }
}
