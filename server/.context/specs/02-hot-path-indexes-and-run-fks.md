# 02 — Hot-path indexes and the missing run/review FKs

Four indexes and two foreign keys on the review tables. One migration.

## Why

### The indexes

Postgres does **not** create an index for a foreign-key column. These four are
the ones the polled endpoints filter on, and none of them exists:

| Column | Queried by | Polled at |
|---|---|---|
| `agent_runs.pr_id`, `agent_runs.status` | `activeRunsForPull()` — `where(workspace_id, pr_id, status='running')` | **4 s**, client-side, whenever a run is in flight |
| `agent_runs.pr_id` | `listRunsForPull()` — the PR run history | on every PR detail load |
| `reviews.pr_id` | the Review Runs list | on every PR detail load |
| `findings.review_id` | every findings panel | with each review |

`repository/run.repo.ts:10` is the hot one. `client/src/lib/hooks/reviews.ts:33`
sets `refetchInterval: 4000` while any run is active, so that predicate runs as
a sequential scan several times a minute for as long as a review takes. On
seeded demo data it is invisible; on a real repo with a few hundred runs it is
not. `client/src/lib/hooks/repo-intel.ts:36` polls at 1500 ms on the same
pattern.

For contrast, the tables that *were* given indexes — `pull_requests`, `repos`,
`symbols`, `file_edges`, `jobs.status` — show the intent was there; the review
tables were simply missed.

### The foreign keys

`reviews.run_id` and `reviews.agent_id` are plain `uuid` columns with **no
`references()`**. The cost of that is already written down in the code —
`repository/run.repo.ts:72`:

> `reviews.run_id` has no FK to `agent_runs`, so the review (and its findings,
> which DO cascade from `reviews`) must be removed explicitly here — otherwise
> deleting a run from the timeline leaves its findings orphaned.

That is a referential invariant held up by a comment and one hand-written
delete. Any second code path that removes an `agent_runs` row — a workspace
teardown, a future bulk cleanup, a `DELETE` in psql — silently orphans reviews
and findings. The database already knows how to do this correctly.

## What lands

Edit `server/src/db/schema/reviews.ts` and `runs.ts`, then **`pnpm db:generate`**
— the migration is generated, never hand-written (`CLAUDE.md` → Do not touch).

### Indexes

```ts
// runs.ts — agentRuns
(t) => ({
  prIdx:     index('agent_runs_pr_idx').on(t.prId),
  activeIdx: index('agent_runs_pr_status_idx').on(t.prId, t.status),
})

// reviews.ts
reviews:  (t) => ({ prIdx: index('reviews_pr_idx').on(t.prId) })
findings: (t) => ({ reviewIdx: index('findings_review_idx').on(t.reviewId) })
```

`agent_runs_pr_status_idx` is `(pr_id, status)` in that order: `pr_id` is the
selective column and it also serves the history query, so the two-column index
covers both call sites and `agent_runs_pr_idx` may end up redundant. Decide
with `EXPLAIN` on seeded data before shipping both.

### Foreign keys

```ts
// reviews.ts
runId:   uuid('run_id').references(() => agentRuns.id,  { onDelete: 'cascade' }),
agentId: uuid('agent_id').references(() => agents.id,   { onDelete: 'set null' }),
```

`cascade` on `run_id` mirrors what `deleteAgentRun` does by hand today.
`set null` on `agent_id` matches the existing choice on `agent_runs.agent_id` —
deleting an agent must not delete its review history.

**Import direction:** `reviews.ts` importing `runs.ts` while `runs.ts` imports
`pulls.ts` is fine, but check for a cycle at generate time; if one appears,
declare the FK from the `runs.ts` side or in a third module.

### Then delete the workaround

With the FK in place, the explicit review delete in `deleteAgentRun`
(`repository/run.repo.ts`) becomes dead code. Remove it **and** the comment
that explains it — a comment describing a constraint that now exists is worse
than none. The integration test covering run deletion
(`*.it.test.ts`) must still pass unchanged: that is the proof the cascade
replaces the manual cleanup exactly.

## Backfill risk

`reviews.run_id` and `reviews.agent_id` may already hold values that point at
deleted rows — nothing has been stopping that. Adding a FK to a column with
orphans **fails the migration**. The generated SQL therefore needs a
hand-added `UPDATE ... SET run_id = NULL WHERE run_id NOT IN (SELECT id FROM
agent_runs)` ahead of the constraint, for both columns.

This is the one case where the generated migration gets edited before it is
first applied. That is not the same as editing a *merged* migration, which
stays forbidden.

## Verification

```sh
cd server && pnpm db:generate && pnpm db:migrate
pnpm exec vitest run .it.test          # needs Docker
```

Plus an `EXPLAIN (ANALYZE)` on the `activeRunsForPull` predicate before and
after, pasted into the PR — the point of the change is the plan flip from
`Seq Scan` to `Index Scan`, and that is worth showing rather than asserting.

## Non-goals

- **No CHECK constraints on `status` / `verdict` yet.** Drizzle's
  `text(..., { enum: [...] })` is types-only and reaches no constraint into the
  database, which is a real gap — but it is a separate change with its own
  backfill question, and bundling it hides this migration's risk.
- **No partial index** (`WHERE status = 'running'`). Tempting for the 4 s poll,
  but it only pays once the table is large; the composite index is the
  proportionate first move.
- **No change to the polling intervals.** Fixing the index is the right fix;
  slowing the poll would be hiding it.
