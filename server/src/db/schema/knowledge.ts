import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  boolean,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One extraction run over a repo. A scan is a row because "last scan" outlives
 * its candidates: `conventions` has no timestamp, `sample_count` is a property
 * of the scan rather than of a rule, and a scan whose gate discarded everything
 * must still be able to say "last scan 2m ago · 0 candidates" instead of
 * falling back to the never-scanned empty state (spec D4).
 */
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  /** Files actually sent to the model (config files + top-ranked sources). */
  sampleCount: integer('sample_count').notNull(),
  /** The resolved feature model, so an old scan says what produced it. */
  model: text('model').notNull(),
  createdAt: now(),
});

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  /**
   * DERIVED from `status` and written only alongside it (spec D2/D3.1). Kept
   * because it is in the shared `ConventionCandidate` contract in both vendored
   * copies and the card's left border reads it; never set independently.
   */
  accepted: boolean('accepted').notNull().default(false),
  /**
   * Triage state. `rejected` is terminal and persists so a re-scan does not
   * re-propose a rule the user has already thrown away (spec D3); the list
   * endpoint returns `pending` and `accepted` only.
   */
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  /** The scan that produced this candidate. Nullable for pre-scan seed rows. */
  scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
  createdAt: now(),
});
