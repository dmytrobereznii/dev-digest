# engineering-insights — examples

Format demonstrations for [`SKILL.md`](SKILL.md). **These are illustrative, not
recorded findings** — they show the shape an entry takes, using DevDigest-shaped
situations. Do not copy them into a real `INSIGHTS.md`.

## The bar: more noise vs insight

Beyond the pair in [`SKILL.md`](SKILL.md):

| ✗ Noise | ✓ Insight |
| --- | --- |
| "Promises can be tricky" | "`Promise.all()` over the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "checkout state always goes through `cartStore.ts` — three components share the cart, and a local `useState` copy desyncs the header badge" |
| "e2e tests can be flaky" | "flows assume exactly one seeded repo — flow 02 follows the home redirect to the *first* one, so a dev DB with several fails 02/04/05. Use `npm run e2e:hermetic`" |
| "watch out for the ORM" | "Prisma Accelerate caps responses at 5MB — use `select`, not `include`, on the findings query" |

Every ✓ entry names the thing, states what happens, and ends with what to do
instead. Every ✗ entry would be equally true in any repo — which is what makes
it worthless here.

## One worked entry per section

### Decisions

```markdown
### 2026-09-15 — Grounding stays a mechanical gate, not a model judgement

**What:** every finding is validated against the diff by string matching before
it is persisted; the model is never asked to self-assess whether a citation is
real.
**Why:** a model that hallucinates a line reference will equally happily
hallucinate a confidence score for it, so self-assessment cannot catch the
class of error the gate exists for.
**Rejected:** a second LLM pass scoring each finding's groundedness — it
doubled run cost and still passed ~1 in 6 invented line references.
```

### What Works

```markdown
- **2026-09-15** — Declaring the classification fields **last** in a structured
  output schema is what makes them informative: with `category` before the
  evidence fields the model labelled all 12 candidates identically, and moving
  them after the evidence produced 5 distinct categories on the same input.
  Generation order is schema order. `reviewer-core/src/llm/structured.ts`
```

### What Doesn't Work

```markdown
- **2026-09-15** — A green `pnpm test` does not mean the integration lane ran:
  `*.it.test.ts` files self-skip when no Docker daemon is reachable, so a
  machine without Docker reports success having exercised none of the DB paths.
  Check the skip count, not the exit code. `server/test/helpers/pg.ts`
```

### Codebase Patterns

```markdown
- **2026-09-15** — `platform/prompt.ts` and `platform/prompts.ts` differ by one
  character and do unrelated jobs — the first re-exports `reviewer-core` for
  per-request data, the second loads `src/prompts/*.md` and interpolates
  `{{var}}`. Editing the wrong one silently changes nothing.
  `server/src/platform/prompts.ts`
```

### Tool & Library Notes

```markdown
- **2026-09-15** — Drizzle's `text('col', { enum: [...] })` narrows the
  TypeScript type only and emits no DB constraint, so a status column is
  unconstrained free text in Postgres — a boot-time reaper matching
  `status='running'` is protected by convention alone. Use `check()` for a real
  constraint. `server/src/db/schema/runs.ts`
```

### Recurring Errors & Fixes

```markdown
- **2026-09-15** — `ERR_MODULE_NOT_FOUND` for `@devdigest/reviewer-core` at API
  boot means `reviewer-core/node_modules` is absent: the server imports its
  TypeScript source through an alias, so the package's own deps must be
  installed even though it emits no JS. `cd reviewer-core && npm install`
```

### Open Questions

```markdown
- **2026-09-15** — Unclear whether the repo map is re-ranked on an incremental
  index or only on a full one; a PR touching a newly-added file appeared to get
  stale importance scores, but this was seen once and not reproduced.
  `server/src/modules/repo-intel/pipeline/incremental.ts`
```

## Refining instead of duplicating

When a near-duplicate already exists, sharpen it in place rather than appending
a second version:

```markdown
- **2026-08-05** — `modules/pulls/` is the only module that never grew past
  routes-only …
  - **2026-09-15** — Sharpening: it is the largest case but not the only one —
    four of eight modules query the DB straight from the transport layer.
    `grep -rln "db/schema" src/modules/*/routes.ts`
```

And when a warning later stops being true, mark it — never delete it:

```markdown
- **2026-08-05** — … original claim …
  **Fixed 2026-09-15 in `server/src/modules/pulls/repository.ts`.**
```
