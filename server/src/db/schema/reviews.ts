import { sql } from 'drizzle-orm';
import { index, pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    /** `set null`, matching agent_runs.agent_id: deleting an agent must not
     *  delete its review history. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** The agent_run that produced this review (links the timeline run ↔ review).
     *  Cascades: deleting a run takes its review, and findings cascade from that. */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  // Read on every PR detail load, to build the Review Runs list.
  (t) => ({ prIdx: index('reviews_pr_idx').on(t.prId) }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  // Read with every findings panel.
  (t) => ({ reviewIdx: index('findings_review_idx').on(t.reviewId) }),
);

/** One row of `pr_intent.sources` (D3/D4) — a persistence-layer mirror of the
 *  shared `IntentSource` contract, kept structurally compatible but untyped on
 *  the enum fields (DB rows are looser than the API contract; the repository
 *  edge casts to `IntentSource[]`, same pattern as `ReviewDto`/`ReviewRecord`). */
export interface IntentSourceRow {
  kind: string;
  ref: string;
  status: 'used' | 'skipped';
  reason: string | null;
  title: string | null;
  chars: number | null;
  truncated: boolean;
}

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // ---- L03 D3: derivation metadata ----
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('low'),
  signals: jsonb('signals').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sources: jsonb('sources').$type<IntentSourceRow[]>().notNull().default(sql`'[]'::jsonb`),
  /** Model slug that derived this row; null before any derivation. */
  model: text('model'),
  /** Estimated USD spend of the derivation; null when unpriced. */
  costUsd: doublePrecision('cost_usd'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  /** head_sha the row was derived against; null before any derivation. */
  headSha: text('head_sha'),
  /** sha256(title + "\n" + body) at derivation time — the freshness key's text half. */
  prTextHash: text('pr_text_hash'),
  derivedAt: timestamp('derived_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
