# `@devdigest/reviewer-core` — the review engine

Pipeline diagram and public API: [`README.md`](README.md)

Package manager is **npm** (`package-lock.json`), not pnpm. Run from
`reviewer-core/`.

## The purity rule

This package is **pure**: no database, no GitHub, no filesystem, no `process.env`.
The only side effect is an LLM call through an **injected** `LLMProvider`. That
constraint is the whole point — it is what makes the engine mock-testable and
what lets both the server and (from L06) the CI runner share it.

If a change here needs to read a file, hit an API, or reach for a secret, it
belongs in a `server/src/adapters/*` adapter instead, passed in as an argument.

## Emits no JS

`build` is a type-check (`tsc --noEmit`). Consumers import the **TypeScript
source** through a tsconfig alias — the server under `tsx` and vitest, and
`reviewer-core/node_modules` must exist or the API fails at boot with
`ERR_MODULE_NOT_FOUND`.

## Pipeline invariants

`review/run.ts` orchestrates: `assemblePrompt()` → `wrapUntrusted()` → injected
`LLMProvider` → `llm/structured.ts` → `groundFindings()`.

- **Grounding is a mandatory gate, not a filter to skip.** A finding that does
  not cite a real line in the diff is dropped. Never route around
  `groundFindings()` — it is what keeps the engine from hallucinating locations.
- **The score is recomputed deterministically from the surviving findings.**
  Never trust a score the model returned.
- **Untrusted content stays fenced.** Diffs and repo content go through
  `wrapUntrusted()` with the injection guard. New prompt inputs get the same
  treatment.
- **Optional prompt slots** (`skills`, `memory`, `specs`, `callers`) are fed by
  later course lessons. `assemblePrompt` omits absent sections — keep new slots
  optional so the starter path stays unchanged.

## Contracts

`@devdigest/shared` aliases to `../server/src/vendor/shared/` — the **server's**
vendored copy, not the client's. See the root `CLAUDE.md` for the duplication
hazard.

## Testing

`make test` covers this package — vitest, hermetic, stubbed `LLMProvider`, no
keys and no network:
prompt assembly, the grounding gate, `toReview` selection, and a full `run`.
The type-check (`make typecheck`) doubles as the build. Details:
[`../TESTING.md`](../TESTING.md)

## `.context/`

`docs/` reference · `specs/` planned changes · `insights/INSIGHTS.md` committed
findings, read and appended by the `engineering-insights` skill.
