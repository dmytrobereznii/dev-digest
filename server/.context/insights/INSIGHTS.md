# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the API package but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

### 2026-09-20 — The API binds to loopback, and credentials are redacted at capture

**What:** `API_HOST` defaults to `127.0.0.1`. The API has **no authentication**
— `LocalNoAuthProvider` hands every request the seeded user — and behind that
port sit routes that write provider API keys to disk
(`POST /settings/test-connection`), report which keys are set, clone arbitrary
URLs onto the host, and spend the owner's LLM credits. `0.0.0.0` published all
of that to every device on the network. `helmet`, the CORS allowlist, the rate
limit and the 1 MB body cap are all correct and none of them is an access
control.

Separately, `redactUrlCredentials` (`platform/redact.ts`) strips URL userinfo
from a failed job's message **where it is captured** — `platform/jobs.ts`,
before the `jobs.error` write — not where it is displayed. `jobs.error` is read
back by the polling UI and is in every database dump, so redacting at the
display end would leave the token in the database, which is the part that
persists. The helper lives in `platform/`, not beside `withGitHubToken` in
`modules/repos/helpers.ts`, because `jobs.ts` is ring 3 and may not import
outward.

**Why:** `docker-compose.yml` runs only Postgres; the API runs on the host by
design, so nothing legitimately needs to reach it from off-box. **Verified, not
assumed** — before: the LAN IP answered `200`; after:
`lsof` reports `TCP 127.0.0.1:3001 (LISTEN)`, `127.0.0.1` and `localhost` both
answer `200`, and the LAN IP is refused. `API_HOST=0.0.0.0` restores the old
behaviour and says so in the boot log.

**e2e is unaffected, and this was checked rather than assumed.** Both
`scripts/e2e.sh` and `e2e-web.yml` start the API as a plain host process and
probe it at `http://localhost:<port>` from the same host. If either ever moves
the API into a container this breaks, and the failure is a bare connection
refused with no hint about the cause.

**Rejected:** Adding authentication (`LocalNoAuthProvider` is a deliberate MVP
choice with an `AuthProvider` port ready behind it — auth is a product
decision, not a hardening one); encrypting `~/.devdigest/secrets.json` (already
mode 0600; encrypting needs a key, which needs somewhere to live, which is the
same problem again); changing how the PAT reaches git (embedding it in the
clone URL is standard — the fix belongs on the error path, not the happy path);
CSRF protection (no cookies, no ambient credentials).

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

- **2026-09-20** — **`pnpm build && pnpm start` in `server/` does not work, and
  never has.** Two independent faults. (1) `tsconfig.json` type-checks against
  `../reviewer-core/src`, so tsc's common root spans both packages and the emit
  is `dist/server/src/server.js`, while `"start"` runs `node dist/server.js` —
  a path that does not exist. (2) `build` is a bare `tsc`, which emits only
  `.js`, so `src/prompts/*.md` never reaches the output; `platform/prompts.ts`'s
  own header says a production build must copy them, and
  `conventions.system.md` is the first template with a live caller, so
  `renderPrompt` would ENOENT even once (1) is fixed.
  It stays invisible because nothing builds this package: `scripts/dev.sh`,
  `server-unit.yml` and `e2e-web.yml` all run the API under `tsx`, and the only
  `pnpm build` in CI is the client's.
  **Do NOT patch it with `cp -R src/prompts dist/prompts`** — that writes to
  `dist/prompts` while the loader resolves `dist/server/src/prompts`, and leaves
  `start` broken while making the build look fixed. A real fix is an
  `outDir`/`rootDir` (or bundler) decision, not a copy step.
  `server/package.json:8`

## Codebase Patterns

- **2026-09-23** — `pr_files` has no stable order and no position
  column. `GET /pulls/:id` refreshes it with a bare `delete` then
  `insert` (no transaction), and the offline read is a `select` with no
  `orderBy`. Anything that reads `pr_files` must key by `path` and must
  not treat row order as GitHub's file order or assume a row survives a
  concurrent refresh. Smart Diff takes display order from `pr.files` on
  the client and joins `/smart-diff` groups by path for this reason.
  `server/src/modules/pulls/routes.ts:235-274`

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

- **2026-09-21** — The seed is idempotent by SKIPPING rows that already exist,
  so a column added later never reaches demo data already in the database. The
  conventions loop does `if (existing) continue`, and after
  `conventions.category` landed every seeded card kept `category = NULL`
  through any number of `pnpm db:seed` runs — the UI showed unlabelled cards
  and nothing failed. The symptom is "a new column is NULL on demo rows only".
  Give the existing-row branch an explicit backfill that writes ONLY the new
  column and leaves triage state, evidence and anything the user may have
  edited alone.
  `server/src/db/seed.ts:389-410`

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
  **2026-09-21 — recomputing by hand is not enough either.** Writing the #491
  fixture the count was still wrong: a 26-line hunk headed `@@ -0,0 +1,25 @@`.
  The check that catches it is runnable — rebuild the diff the way
  `modules/reviews/diff-loader.ts` does (`diff --git` / `---` / `+++` / patch,
  per file) and feed it to `parseUnifiedDiff`. What it reports IS what the diff
  viewer and the grounding gate see, so check a fixture's declared
  `additions`/`deletions` and any cited line against the parser's
  `newStart … newStart + newLines - 1`, not against your own arithmetic.
  **Fixed 2026-09-21 in `server/test/seed-fixtures.test.ts`** — that check is
  now an assertion in the unit lane, so this entry is history, not a ritual.
  It caught a defect already on the branch the moment it was written: #486
  declared `additions: 5` on a file whose body adds 6, so the PR's `+153` did
  not match its own files. Two prose counts in that fixture's comments were
  stale as well. Both the arithmetic and the doc comments were reviewed by a
  human and by CI and neither noticed. If you add a field to `DemoPr` that can
  contradict the patch body, add it to that test in the same commit.
  `server/test/seed-fixtures.test.ts`

- **2026-09-20** — A `dependency-cruiser` rule whose `to.path` anchors on the
  package name (`^openai`, `^node_modules/drizzle-orm`) silently matches
  nothing under pnpm: the resolved path is
  `node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai/index.js`.
  The rule reports zero violations and looks green. Write `node_modules/openai`
  with no `^`, and validate every new rule by planting a temporary violation.
  `server/.dependency-cruiser.cjs`

## Open Questions

- **2026-09-23** — `test/intent.it.test.ts` > "a review run stores
  prompt_assembly.intent in the trace" failed once in a standalone
  `make test-it`, but passed inside `make check` just before and 3/3 in
  isolation (`pnpm exec vitest run test/intent.it.test.ts`). Cause
  unknown; possibly timing under the full lane. If it recurs, capture
  the assertion output before re-running.
