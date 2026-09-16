# 01 — Run cost and severity counts: the API slice

The server half of L01. The cross-package design and the UI surfaces live in
the root specs [`01-run-cost.md`](../../../.context/specs/01-run-cost.md) and
[`02-severity-badges.md`](../../../.context/specs/02-severity-badges.md); this
file covers only what `@devdigest/api` stores, computes and returns.

## Why

The engine already priced every run (`ReviewOutcome.costUsd`), and the server
dropped it on the floor: `agent_runs` had no column for it. Findings were
persisted per review but the PR list only surfaced a score, so the client had
no per-severity numbers without fetching every PR's reviews.

## Changes

| Area | Change |
|---|---|
| Schema | `agent_runs.cost_usd double precision` null — `src/db/schema/runs.ts`, generated migration `0010_aspiring_impossible_man.sql` |
| Run lifecycle | `ReviewRunExecutor` passes `outcome.costUsd` to `completeAgentRun`; failed and cancelled runs write `null` |
| `GET /repos/:id/pulls` | adds `cost_usd` and `findings` (`SeverityCounts`) to every `PrMeta` row — `src/modules/pulls/routes.ts` |
| `GET /pulls/:id/runs` | `RunSummary.cost_usd` — `repository/run.repo.ts` |
| `GET /pulls/:id/reviews` | `ReviewRecord.cost_usd`, left-joined from `agent_runs` on `reviews.run_id` — `repository/review.repo.ts` |
| `GET /runs/:id/trace` | `RunStats.cost_usd` |
| Contracts | `SeverityCounts`, `PrMeta.cost_usd` / `.findings`, `RunSummary`, `RunStats`, `ReviewRecord` — both vendored `shared/` copies |
| Seed | the sample review on PR #482 gets a backing `agent_runs` row (`cost_usd 0.014`, self-healing for DBs seeded earlier) |

## Decisions

- **Computed on read, no denormalisation.** The list folds three queries —
  latest review per PR, grouped finding counts for those review ids, `SUM` of
  run cost per PR — the same way `score` already was. No trigger or counter
  column can drift.
- **Cost is total spend; counts are the latest review only.** Summing cost
  over every `status='done'` run is what the user paid. Summing findings over
  runs would count one issue once per agent that found it.
- **Dismissed findings are excluded from the list counts**
  (`isNull(findings.dismissedAt)`), matching the PR page's blocker count.
- **`SUM` over NULLs.** Postgres skips them, so an unpriced run drops out of the
  total and an all-unpriced PR returns `NULL` → `—`. Postgres returns the
  aggregate as a string; the route casts with `Number()`.
- **`PrMeta` fields are `.nullish()`**, not `.nullable()`: the GitHub adapters
  also build `PrMeta` and must not have to supply them.

## Tests

- `test/contracts.test.ts` — the new fields parse as optional + nullable.
- `test/integration.it.test.ts` — cost totals only `done` runs (a failed run's
  `0.99` and a `null` are skipped; a PR with no priced run stays `null`).
  Counts: PR #482 lists `{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }`; unreviewed
  PRs list `null`; a newer review replaces the counts and its dismissed finding
  drops out.
- `test/reviews.it.test.ts` — one run's cost reaches all three readers: the
  `agent_runs` row, `trace.stats.cost_usd` and `review.cost_usd`.
