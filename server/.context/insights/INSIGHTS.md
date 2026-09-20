# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the API package but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

### 2026-09-20 — One composite index on `agent_runs`, not two; and what was deliberately left out

**What:** `agent_runs` carries exactly one new index,
`agent_runs_pr_status_idx (pr_id, status)`. The separately-proposed
`agent_runs_pr_idx (pr_id)` was **measured and dropped as redundant** — as the
leftmost prefix, the composite already serves the `pr_id`-only run-history
query. Do not add it back without a plan that shows otherwise.

Three things were considered and deliberately not done, each for a reason that
is not visible in the schema:

- **No CHECK constraint on `status` / `verdict`.** Drizzle's
  `text(..., { enum: [...] })` is types-only and reaches no constraint into the
  database — a real gap, but it carries its own backfill question and bundling
  it would have hidden this migration's risk.
- **No partial index** (`WHERE status = 'running'`) for the 4 s poll. It only
  pays once the table is large; the composite is the proportionate first move.
- **No change to the polling intervals** (`reviews.ts` 4000 ms,
  `repo-intel.ts` 1500 ms). Indexing is the fix; slowing the poll would be
  hiding it.

**Why:** Measured on a local Postgres, seeded + 50k synthetic runs in a
rolled-back transaction. At the seeded size (27 runs) the planner correctly
still picks a Seq Scan — a single heap page beats an index lookup — so the
seeded EXPLAIN proves nothing either way. **Any future index claim on these
tables has to be measured at realistic scale or it is not evidence.**

**Evidence:** before → `Seq Scan on agent_runs, Rows Removed by Filter: 27`;
after, at 50k rows → `Index Scan using agent_runs_pr_status_idx`,
`Index Cond: ((pr_id = …) AND (status = 'running'))`, `Buffers: shared hit=2`.
The `pr_id`-only history query takes the same index with
`Index Cond: (pr_id = …)` — which is what retired `agent_runs_pr_idx`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — `app.ts`'s `isResponseSerializationError` branch is LIVE as
  of the response-contract work; before it, no route declared a response schema
  so the branch could not fire. Proved by planting a field the handler does not
  return: the route returns `500 {"error":{"code":"internal_error"}}` and the
  raw object is logged, not sent. A route that suddenly 500s with that body is
  a contract violation, not a crash — read the log line above it.
  `server/src/app.ts`

- **2026-09-20** — `ReviewDto` / `ReviewDtoFinding` in
  `modules/reviews/helpers.ts` are now type ALIASES of the shared
  `ReviewRecord` / `FindingRecord`. They used to be hand-written duplicates and
  had already drifted: `verdict` was widened to `string | null`, so a row
  holding any string type-checked. `reviews.verdict` is still free-form `text`
  in the DB, so `reviewToDto` casts — the `response:` schema on
  `GET /pulls/:id/reviews` is what actually enforces the three `Verdict` values
  now. Do not re-introduce a local copy of a shape `vendor/shared` already
  describes.
  `server/src/modules/reviews/helpers.ts`

- **2026-09-20** — `pull_requests.status` holds GitHub's MERGE state
  (`open` / `merged` / `closed`); the review status the PR list shows is
  DERIVED by `deriveReviewStatus` from `lastReviewedSha` vs `headSha` plus
  `updatedAt` against `STALE_DAYS`. The #482 seed writes `'needs_review'` into
  that column, which works only because the function falls through on any
  non-merged/closed value — do not copy that into a new fixture.
  `server/src/modules/pulls/status.ts:37`

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-20** — `pnpm add` in `server/` can fail with
  `ERR_PNPM_UNEXPECTED_STORE`: `server/node_modules` is linked to
  `~/Library/pnpm/store/v11` while pnpm 10.34.5 wants `v10`. The only fix is
  `cd server && pnpm install`, which **purges and relinks
  `server/node_modules`** — pnpm refuses to do it without a TTY, which is the
  guard that stops an agent doing it silently. Do not run it while anything
  else is working against that tree, and never hand-write the dependency into
  `package.json` to route around it (the lockfile may only change through its
  own manager). `client/` relinked itself on its first `pnpm add` and is fine.

- **2026-09-20** — A hand-written hunk header in a seed fixture is checked by
  nothing. The diff parser trusts `@@ -a,b +c,d @@`, and a finding anchors only
  inside `newStart … newStart + newLines - 1`. Get `newLines` wrong and seeded
  findings silently fail to anchor in the diff viewer while typecheck and the
  unit lane stay green. After every patch edit recompute from the body —
  `newLines` = context + `+` lines, `oldLines` = context + `-` lines — rather
  than trusting the header you typed.
  `server/src/db/seed-prs/types.ts`

- **2026-09-20** — A `dependency-cruiser` rule whose `to.path` anchors on the
  package name (`^openai`, `^node_modules/drizzle-orm`) silently matches
  nothing under pnpm: the resolved path is
  `node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai/index.js`.
  The rule reports zero violations and looks green. Write `node_modules/openai`
  with no `^`, and validate every new rule by planting a temporary violation.
  `server/.dependency-cruiser.cjs`

## Open Questions
