# Cost accounting in the engine

How `run()` arrives at `ReviewOutcome.costUsd`, the number the server persists
to `agent_runs.cost_usd` and every cost surface displays.

## Semantics

`costUsd: number | null` — estimated USD for the whole run. `null` means
**unpriced**, not free: at least one LLM call had no price. The UI renders it
as `—`.

## Per call — the provider (`src/llm/openrouter.ts`)

For each `completeStructured` call, in order of preference:

1. **`usage.cost` from the OpenRouter response** — the provider's own billing
   figure, an OpenRouter extension absent from the OpenAI SDK type.
2. **The injected `estimateCost(model, tokensIn, tokensOut)`** hook.
3. **`null`.**

Tokens and API cost accumulate across **every attempt** inside the call,
including schema-repair reprompts, so a response that needed two retries costs
three calls.

Pricing lives outside the engine on purpose. The purity rule forbids `fetch`
and `process.env` here, so the server injects `PriceBook.estimate` (live
OpenRouter `/models` prices with a static fallback) through the constructor
option. A caller that injects nothing gets API cost or `null`, never a guess.

## Per run — `src/review/run.ts`

`run()` sums call costs across chunks (one chunk in single-pass, one per file
in map-reduce) starting from `0`:

```ts
costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
```

**Null is sticky.** One unpriced chunk makes the whole run `null`, instead of
under-reporting a partial sum as if it were the total. Grounding and scoring
run after the LLM calls and cost nothing.

## Consequences downstream

- A run on a model missing from every price table shows `—` everywhere, and
  its cost drops out of the PR list's `SUM`.
- Failed and cancelled runs are persisted with `null` by the server, whatever
  was spent before the failure.
