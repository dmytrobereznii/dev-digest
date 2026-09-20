# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this repo but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

### 2026-09-20 — Response contracts: `response:` on every route, parse only in `api.ts`

**What:** Every Fastify route declares a `response:` schema built from a
`vendor/shared` contract, spreading the shared `ApiErrors` (422/500) and, where
the route resolves a row by id, `NotFound` (404) from
`modules/_shared/schemas.ts`. Codes NOT listed fall through to Fastify's default
serializer on purpose — `@fastify/rate-limit`'s 429 and `/health/ready`'s 503 do
not belong on all 37 routes.

**The one exception is `GET /runs/:id/events`**, and it cannot be fixed:
`reply.sse()` hijacks the reply and streams `text/event-stream` frames, so
there is no single JSON body to serialize. Anyone auditing "36 of 37" should
stop there rather than trying to close the gap.

On the client, `apiFetch(path, init?, schema?)` parses when a schema is passed
and parsing happens **only** there — it is the single transport, so a component
never sees an unvalidated body. A parse failure throws `ApiError` with status
**0** and code `contract_mismatch`; status 0 is what puts it in the same bucket
as a network failure, which `QueryCache.onError` in `lib/providers.tsx` already
toasts. Any other status would render as a silent `undefined` in a component.

**Why:** Once the server declares response schemas, the only bug left for the
client parse to catch is the two vendored copies of `@devdigest/shared` having
drifted — narrow, but real, and the two-copy rule guarantees it recurs.

**Rejected:** Parsing in components or hooks (two places to forget); declaring
429/503 on every route (noise, and the rate-limit body is not our envelope);
making the client parse mandatory (it is opt-in per call, adopted hook by hook).

**Evidence:** `server/src/modules/_shared/schemas.ts` (`ApiErrors`, `NotFound`,
`OkResponse`), `client/src/lib/api.ts`, `client/src/lib/hooks/reviews.ts`.
Verified by parsing 66 live payloads from every seeded row with the CLIENT's
vendored contracts: 0 drift failures.

### 2026-09-20 — The enforcement lane is deterministic-only; `pr-self-review` stays local

**What:** Two separate gates, deliberately not merged. The deterministic half
— `pnpm exec eslint .` in both TypeScript packages and `pnpm exec depcruise src`
in `server/` — runs locally via `make lint` / `make lint-arch` **and** in
`client.yml` / `server-unit.yml`. The model-driven half, the `pr-self-review`
skill, gets **no CI workflow and no branch protection**: it runs locally,
pre-`gh pr`, behind a hook. Anything needing judgment belongs to the second and
must not be re-expressed as a CI step.

Two rules keep the lane honest, and both are load-bearing:

- **A lint rule is `error` only where the whole tree already satisfies it.**
  Everything else ships at `warn` against a stated baseline, so the first green
  build means something. Current baselines: client **0 errors / 52 warnings**
  (deep-relative-import debt), server **0 / 0**, `depcruise` **0 errors / 15
  warnings** (the `no-circular` debt).
- **One source of truth per boundary.** `.dependency-cruiser.cjs` owns the
  onion rings; `server/eslint.config.mjs` is deliberately thin and does not
  restate them. That is also why `eslint-plugin-boundaries` stays rejected even
  now that the server has a linter.

**Why:** This decision has been orphaned twice — it was recorded in
`.context/specs/03-pr-self-review-skill.md`, restated in
`.context/specs/04-enforcement-lane.md`, and both were deleted on merge per
`CLAUDE.md`. It lives here now because the obvious "improvement" to either gate
is to fold it into the other, and nothing in the code says why not.

**Rejected:** A CI workflow for `pr-self-review` (it needs a model, and a
non-deterministic required check is worse than no check); duplicating the ring
rules into ESLint (two sources of truth for one boundary).
**Evidence:** `server/eslint.config.mjs`, `client/eslint.config.mjs`,
`server/.dependency-cruiser.cjs`, `Makefile` → `lint` / `lint-arch`.

### 2026-09-16 — Lesson features are built from scratch, never recovered from history

**What:** Every README lesson feature (L01–L08) is implemented from the
artboards in `.context/docs/design/` and a fresh spec, even though git history
holds a finished implementation of most of them. `git log -S <symbol>` surfaces
a removal commit for each — L01's run cost was stripped in `d45ab0d` — and
those commits are off-limits as a source, including as a checklist of files to
touch. Reading what the starter *currently* ships is a different thing and is
expected: `estimateCost()` and `PriceBook` are live code you find by grepping
`server/src/adapters/llm/`, and building on them is not a shortcut.

**Why:** The workshop's deliverable is the act of building the feature. A
recovered implementation produces the right diff and skips the entire exercise,
and it also skips the design decisions the lesson exists to surface.

**Rejected:** Reverting or reading the removal commit as a blueprint. It is
faster and lands a known-good diff, which is precisely why it defeats the
point — and the shortcut is tempting enough that L01 was very nearly built
that way.
**Evidence:** the live code to build on is
`server/src/adapters/llm/pricing.ts:37` (`estimateCost`) and
`server/src/platform/price-book.ts:21` (`PriceBook`); the off-limits removal is
`git show --stat d45ab0d`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
