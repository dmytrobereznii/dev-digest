import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

/** One frozen eval case: the expectation, the stored diff and the PR meta at
 *  creation. `finding_id` is a nullable unique link (many NULLs coexist). */
export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'set null' }),
    expectationType: text('expectation_type', { enum: ['must_find', 'must_not_flag'] }).notNull(),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    title: text('title').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    inputDiff: text('input_diff').notNull(),
    prTitle: text('pr_title').notNull(),
    prDescription: text('pr_description'),
    createdAt: now(),
  },
  (t) => ({
    findingUnique: uniqueIndex('eval_cases_finding_id_unique').on(t.findingId),
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
  }),
);

/** One run of an agent's whole case set, with the version/prompt/model snapshot. */
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    durationMs: integer('duration_ms'),
    agentVersion: integer('agent_version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    tracesPassed: integer('traces_passed'),
    tracesTotal: integer('traces_total').notNull(),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
  },
  (t) => ({
    agentRanIdx: index('eval_runs_agent_ran_idx').on(t.agentId, t.ranAt),
    // At most one running run per agent.
    oneRunning: uniqueIndex('eval_runs_one_running')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

/** Per-case result of a run. `case_id` has no FK on purpose: deleting a case
 *  keeps past results. */
export const evalCaseResults = pgTable(
  'eval_case_results',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').notNull(),
    caseName: text('case_name').notNull(),
    expectationType: text('expectation_type', { enum: ['must_find', 'must_not_flag'] }).notNull(),
    pass: boolean('pass').notNull(),
    matched: integer('matched').notNull(),
    unjudged: integer('unjudged').notNull(),
    kept: integer('kept').notNull(),
    dropped: integer('dropped').notNull(),
    findings: jsonb('findings').notNull(),
    durationMs: integer('duration_ms').notNull(),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.caseId] }),
    caseIdx: index('eval_case_results_case_idx').on(t.caseId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
