# PR list read model — how `GET /repos/:id/pulls` derives its numbers

Reference for the per-row fields that are **not** columns on `pull_requests`.
All are computed on every read in `src/modules/pulls/routes.ts`; none is
denormalised, so there is nothing to backfill or keep in sync.

| Field | Source | Rule |
|---|---|---|
| `score` | `reviews.score` | newest review with `kind = 'review'` for the PR; `null` if none |
| `findings` | `findings` grouped by `review_id, severity` | that same newest review only; `dismissed_at IS NULL`; all three keys present (zeros filled); `null` when the PR has no review |
| `cost_usd` | `SUM(agent_runs.cost_usd)` | every run with `status = 'done'`; NULL costs skipped by `SUM`; `null` when nothing priced |
| `status` | `deriveReviewStatus()` | GitHub state + `last_reviewed_sha` vs `head_sha` + age |

`cost_usd` excludes intent-derivation spend (L03 D13): `pr_intent.cost_usd` is
never folded into this `SUM`. One derivation serves every agent in a run, so
splitting it across `agent_runs` rows would be arbitrary; it shows on the
Intent card instead.

## Where each number comes from upstream

```
reviewer-core run()  ── ReviewOutcome.costUsd ──►  ReviewRunExecutor
                                                   └─ completeAgentRun(costUsd)  → agent_runs.cost_usd
                                                   └─ persist review + findings  → reviews / findings
```

`costUsd` is priced inside the LLM provider, not here: the OpenRouter provider
prefers the API's own `usage.cost`, then the injected `PriceBook.estimate`
(live `/models` prices, 6 h TTL, static `adapters/llm/pricing.ts` as the
fallback). The OpenAI and Anthropic adapters call `estimateCost` directly. A
model missing from every table yields `null`, which is a valid, displayed
state (`—`), not an error.

## Consumers that read the same data differently

- **Review runs accordion** (`GET /pulls/:id/reviews`) returns *every*
  finding, dismissed included; the client's severity pills count that full set.
  The list and the run timeline exclude dismissed. A run with a dismissed
  finding therefore shows one more in the accordion than on the list.
- **Trace drawer** (`GET /runs/:id/trace`) reads `stats.cost_usd` from the
  trace document written at run completion, not from `agent_runs`.

## Cost of the read

Three `IN (…)` queries over the page's PR ids, grouped in SQL or folded in JS.
Diff-stat backfill from GitHub (`BACKFILL_LIMIT` rows) runs before them in the
same handler and is the slow part when a token is configured.
