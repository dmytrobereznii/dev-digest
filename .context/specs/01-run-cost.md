# 01 — Run cost

Show the USD cost of AI review runs. Lesson L01 ("Run cost badge").

## Why

The studio spends money on every review and shows none of it. The mentor design
draws spend on four surfaces; this spec covers the three in scope.

The LLM-side plumbing is already in the starter and this feature builds on it
rather than replacing it: `estimateCost()` with its per-model price table
(`server/src/adapters/llm/pricing.ts`), the live OpenRouter `PriceBook`
(`server/src/platform/price-book.ts`), `costUsd` on all three LLM adapters, and
`ReviewOutcome.costUsd` (`reviewer-core/src/review/run.ts`, where a null is
sticky across chunks, so one unpriced chunk makes the whole run unpriced). What
is missing is everything downstream of the engine: `agent_runs` has no cost
column, the contracts carry no cost field, and nothing renders it.

## Surfaces

| # | Screen | Design | What lands |
|---|---|---|---|
| 1 | PR list | `screen_dashboard.jsx:82,113-114` | `Cost` column between Status and Updated, `<CostBadge usd={pr.cost_usd} />` |
| 2 | PR detail · Agent runs | `prdetail_runs.jsx:89-91` | Timeline row: `"{tokens} tok · {cost}"` under the start time |
| 2 | PR detail · Review runs | `prdetail_runs.jsx:126` | Accordion header: `CostBadge` immediately before the timestamp |
| 3 | Run trace drawer | `screen_trace.jsx:95-97` | Fourth stat tile `COST` between `TOKENS` and `FINDINGS` |

## Decisions

- **PR-list cost is TOTAL spend**: `SUM(cost_usd)` over runs with
  `status='done'`. SQL `SUM` skips NULLs, so an all-unpriced PR yields NULL →
  em-dash, and a mixed PR sums only the priced runs.
- **One formatter**, `formatUsd`: null/undefined → `—`; `≥ 1` → `$X.XX`;
  `< 1` → `$0.XXX`; and 4 decimals when 3 would render `$0.000` for a non-zero
  amount (`$0.0013`). This supersedes the design's three per-surface
  precisions (3dp badge / 4dp timeline / 2dp drawer).
- **`formatUsd` and `CostBadge` live in the vendored kit** (`@devdigest/ui`):
  the kit imports nothing from app code, and `CostBadge` needs the formatter.
  `fmt` in `client/src/lib/model-label.ts` stays as it is — different zero case,
  it drives the `$/1M` model labels.
- **Accordion cost source**: `ReviewRecord.cost_usd`, filled server-side by
  left-joining `agent_runs` on `reviews.run_id`. Passing a run lookup down from
  `FindingsTab` would couple the accordion to a second query's load state.
- **Model key**: `agent_runs.model` already stores the provider-native id
  (`gpt-4.1`, `deepseek/deepseek-v4-flash`) and is key-compatible with
  `pricing.ts`. Unknown model → null cost → `—`.
- **Nullability**: `RunSummary`, `RunStats`, `ReviewRecord` use
  `z.number().nullable()`. `PrMeta` uses `.nullish()` like `score`, because the
  GitHub adapters also produce `PrMeta` and must not have to supply it.

## Out of scope

The fourth design surface (`screen_pr_detail.jsx:86`, cost in the Compose
Review drawer) and every aggregate screen (agent performance, CI runs, eval)
belong to later lessons.
