# 04 — The enforcement lane

Give the repo's written rules a mechanical check that runs without an agent:
ESLint in both TypeScript packages, `dependency-cruiser` behind a `make`
target, and both wired into CI.

## Why

Every architecture rule in this repo is currently enforced by *an agent having
read a skill*. That works while the agent is in the loop and stops working the
moment it isn't.

Concretely, as of the L02 branch:

- **`dependency-cruiser` never runs outside a developer's shell.** The onion
  rings are encoded in `server/.dependency-cruiser.cjs`, the
  `onion-architecture` skill calls that file its *Enforcement*, and the skill
  even drafts the `make lint-arch` target — but no Makefile target and no
  workflow invokes it. A PR that breaks `sdk-outside-adapters` or
  `sql-in-routes` goes green.
- **Neither package has ESLint at all.** No config file, no `lint` script, no
  dependency. `react-hooks/exhaustive-deps` has therefore never run against
  this codebase, and there is already a live instance of exactly what it
  catches: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:71` memoizes
  over `runs` while declaring `[reviews]`. Harmless today because
  `runs = reviews ?? []`; it is the drift that is the problem.
- **All five workflows are `typecheck` + `test` and nothing else.**

The `frontend-architecture` skill states the consequence plainly in its
Enforcement notes: *"there is no linter in `client/`"*. This spec removes that
sentence's reason to exist.

## Non-goal — this is not the `pr-self-review` gate

The `pr-self-review` skill was built to an explicit decision: **no CI
workflow, no branch protection** for that gate — it is local-only and
model-driven. (That decision was recorded in `.context/specs/03-pr-self-review-skill.md`,
deleted on merge per `CLAUDE.md`; it is restated here because this spec is the
one that could be mistaken for reopening it.) It stands, and this spec does not
reopen it. The self-review gate stays local and
model-driven; what moves into CI here is only the deterministic half — the
commands that need no model. The two are complementary:

| | Runs where | Needs a model | Catches |
|---|---|---|---|
| `pr-self-review` | local, pre-`gh pr` | yes | conformance, judgment, repo rules |
| this lane | local + CI | no | boundary violations, hook deps, dead code |

## What lands

### 1. `dependency-cruiser` gets a target

```make
lint-arch: ## Check the onion-architecture boundaries (server)
	cd server && pnpm exec depcruise src
```

Verbatim from the `onion-architecture` skill, which already reserved it.

**Baseline is 0 errors, 15 warnings** and the target must keep passing on the
unchanged tree. `depcruise` exits non-zero only on errors, so the 15 warnings
do not fail the build — which is the intent; they are the accepted debt listed
in the skill's *Known exceptions* table.

### 2. ESLint in `client/`

`eslint-config-next` is the baseline — it is the config Next ships for this
exact purpose, and it carries `react-hooks/*` and `@next/next/*`.

Rules this repo specifically wants on top, each traceable to a skill:

| Rule | Level | From |
|---|---|---|
| `react-hooks/exhaustive-deps` | `error` | `react-best-practices` |
| `react-hooks/rules-of-hooks` | `error` | `react-best-practices` |
| `@next/next/no-html-link-for-pages` | `error` | `next-best-practices` |
| `no-restricted-globals` — `confirm`, `alert`, `prompt` | `error` | `frontend-architecture` § Copy (untranslatable) + the app already has a modal/toast system |
| `no-restricted-imports` — `../../../*` | `warn` | `frontend-architecture` § Naming — the `@/` alias rule, at `warn` because the 51-import baseline is accepted debt |

### 3. ESLint in `server/`

No React, so `typescript-eslint` only, and deliberately thin —
`dependency-cruiser` already owns the architectural rules and duplicating them
in ESLint would give two sources of truth for one boundary.

Worth having:

| Rule | Level | Why |
|---|---|---|
| `@typescript-eslint/no-floating-promises` | `error` | the codebase is full of `await`-driven job and SSE paths; a dropped promise there fails silently |
| `@typescript-eslint/no-misused-promises` | `error` | same |
| `no-restricted-syntax` — `process.env` under `modules/**` and `platform/**` (except `config.ts`) | `error` | `platform/config.ts` documents that the SecretsProvider is *"the one chokepoint that reads process.env directly"*. That invariant is currently a comment. Measured: **0 violations** in that scope today, so it can ship as `error` |

`no-floating-promises` needs type-aware linting, so the config points at
`tsconfig.json`. That makes the lane slower than the others; it stays a
separate job in CI rather than blocking the test job.

### 4. Makefile

```make
lint: ## ESLint both TypeScript packages
lint-arch: ## Check the onion-architecture boundaries (server)
```

`make help` must still list every target — it greps `^[a-z0-9-]+:.*?## `, so
both rows appear for free.

### 5. CI

One new job on the existing workflows rather than a sixth workflow, so the
path filters already in place keep doing their work:

- `client.yml` → `pnpm lint` after `typecheck`
- `server-unit.yml` → `pnpm lint` and `pnpm exec depcruise src` in the
  existing `typecheck` job

## Expected fallout

Turning on a linter that has never run will surface violations in code nobody
is changing. The rule for this spec:

- A violation in code this spec does not touch is **fixed only if it is a
  one-liner**, otherwise the rule ships at `warn` with a dated note and a
  follow-up row. CI fails on errors only.
- The *Known exceptions* tables in `onion-architecture` and
  `frontend-architecture` are the authority on what is accepted debt. A lint
  rule must not contradict them — that is why the `@/` alias rule is `warn`.

This keeps the first green build honest: a rule that is `error` here is one the
whole tree already satisfies.

## Status — 2026-09-20

**Client half and the CI wiring are done; the server half is blocked.**

| Item | State |
|---|---|
| `client/eslint.config.mjs` + `eslint` / `eslint-config-next` | done — **0 errors, 52 warnings** |
| `Makefile` → `lint`, `lint-arch` | done — both listed by `make help` |
| `client.yml` → `pnpm exec eslint .` | done |
| `server-unit.yml` → `pnpm exec depcruise src` | done |
| `server/eslint.config.mjs` + deps | **blocked** — see below |

### The six errors the first run found, all fixed

Every one was a one-liner, so all were fixed under the rule below rather than
downgraded:

| File | Rule |
|---|---|
| `AddRepoView.tsx:81` | `@next/next/no-html-link-for-pages` — an `<a>` with `preventDefault` + `router.push`, i.e. a hand-rolled `<Link>` |
| `FindingsTab.tsx:21` | `no-explicit-any` ×3 — `UseMutationResult<any, any, string, any>`, now the real shape from `useCancelRun()` |
| `PrDetailHeader.tsx:106` | `react/no-unescaped-entities` |
| `page.tsx:74` | **`react-hooks/exhaustive-deps`** — the `useMemo` over `runs` declaring `[reviews]`. Memoizing over `reviews` directly fixes it without defeating the memo |

Plus one **unused `eslint-disable` directive** at `ReviewRunAccordion.tsx:52`,
suppressing `react-hooks/exhaustive-deps` for a dependency array that was
already complete — a comment written against a linter that had never run.
Two other disables in the tree (`ConfigTab.tsx:39`, `lib/hooks/reviews.ts:212`)
are load-bearing and were left alone.

The 52 remaining warnings are the deep-relative-import baseline —
`frontend-architecture` § Known exceptions records 51, and the rule fires once
per import rather than per file.

### Blocked: ESLint in `server/`

`pnpm add -D` in `server/` fails with `ERR_PNPM_UNEXPECTED_STORE`:
`server/node_modules` is linked to `~/Library/pnpm/store/v11` while pnpm
10.34.5 wants `v10`. The documented fix is `pnpm install` in that package,
which purges and relinks `server/node_modules` — **not** something to run while
other work is in flight against it.

This is a pre-existing environment condition, not a consequence of this spec.
Resolve it by running, in a quiet tree:

```sh
cd server && pnpm install && pnpm add -D eslint@^9 typescript-eslint@^8
```

then adding `server/eslint.config.mjs` with the three rules in the table above
and a `pnpm exec eslint .` step in `server-unit.yml`'s typecheck job.

**Do not hand-write the devDependency into `server/package.json`.** A lockfile
may only change as the by-product of its own manager (`CLAUDE.md` → Do not
touch).

## Files this spec will produce

```
client/eslint.config.mjs          # done — flat config, eslint-config-next
client/package.json + lockfile    # done — eslint, eslint-config-next, @eslint/eslintrc
Makefile                          # done — +lint, +lint-arch
.github/workflows/client.yml      # done — +eslint step
.github/workflows/server-unit.yml # done — +depcruise step
server/eslint.config.mjs          # TODO — blocked on the store mismatch
server/package.json + lockfile    # TODO — blocked on the store mismatch
```

Both path filters already use `client/**` and `server/**`, so the new config
files trigger their own workflows with no filter change.

**`TESTING.md`'s `skip-worktree` note is stale.** It states that
`server/package.json` is `skip-worktree`; `git ls-files -v` reports `H` for
both `server/package.json` and `client/package.json`, so neither is. The
practice it justified is still worth keeping — CI invokes `pnpm exec eslint .`
and `pnpm exec depcruise src` directly rather than through a committed script,
matching how the vitest split is already invoked — but the stated reason no
longer holds and that line in `TESTING.md` should be corrected.

## Non-goals

- **No Prettier.** Formatting is not currently a source of friction and adding
  it would churn every file.
- **No new architectural rules in ESLint.** `dependency-cruiser` owns those.
- **No fixing the accepted debt.** The `"use client"` placement, the 51 deep
  relative imports and the four `sql-in-routes`-exempt route files stay exactly
  as they are; this spec only makes new instances visible.

## Open questions

1. ~~Does `server/package.json` being `skip-worktree` make a committed `lint`
   script unreliable?~~ **Moot — it is not `skip-worktree`.** CI calls
   `pnpm exec` directly anyway, for consistency with the vitest split. The
   stale claim in `TESTING.md` is a separate one-line fix.
2. ~~Should `no-restricted-syntax` on `process.env` be `error` from day one?~~
   **Resolved — yes, scoped to `modules/**` and `platform/**`.** Measured on
   L02: the only real reads outside `platform/config.ts` are `db/migrate.ts:38`
   and `db/seed.ts:339` (standalone scripts, legitimate) and the two *writes*
   at `adapters/git/simple-git.ts:33-34` that set `GIT_TERMINAL_PROMPT` for git
   subprocesses (also legitimate, and in `adapters/`). Scoping the rule to the
   application rings leaves those alone and starts at zero violations.
