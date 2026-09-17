# DevDigest

Local-first AI pull-request review. Architecture and package map: @README.md

## Repo shape

Four standalone packages — **not** a workspace. Each has its own `package.json`
and lockfile; cross-package imports resolve through tsconfig path aliases, not
published modules. Run every script from inside its package directory.

Everything is TypeScript on Node ≥ 22, with Zod contracts at every boundary.

| Package | Stack | Manager | Scripts |
|---|---|---|---|
| `server/` | Fastify, Drizzle ORM on Postgres + pgvector, `fastify-type-provider-zod`, Octokit, OpenAI/Anthropic SDKs, ast-grep · vitest + testcontainers | pnpm | `dev` `test` `typecheck` `db:generate` `db:migrate` `db:seed` |
| `client/` | Next.js 15 (App Router), React, TanStack Query, next-intl, Tailwind · vitest + React Testing Library (jsdom) | pnpm | `dev` `build` `test` `typecheck` |
| `reviewer-core/` | Pure engine, `openai` SDK (OpenRouter) + Zod, no runtime deps beyond them · vitest | **npm** | `test` `typecheck` |
| `e2e/` | Vercel agent-browser driven by a `tsx` runner, JSON flow specs | **npm** | `test` `typecheck` `e2e:hermetic` |

Never run pnpm in `reviewer-core/` or `e2e/`, or npm in `server/`/`client/`.

`reviewer-core` emits no JS — the server imports its **TypeScript source**
through an alias, so `reviewer-core/node_modules` must exist or the API crashes
at boot with `ERR_MODULE_NOT_FOUND`. `scripts/dev.sh` handles this.

## `@devdigest/shared` is vendored twice — keep both copies in sync

There is no single shared package. The same contracts are duplicated:

- `client/src/vendor/shared/` — aliased by `client`
- `server/src/vendor/shared/` — aliased by `server` **and** `reviewer-core`

Editing a contract means editing **both** copies. They have already drifted
(`adapters.ts`, `contracts/{eval-ci,knowledge,productionize,trace}.ts`), so
diff them before assuming a type is shared:

    diff -r client/src/vendor/shared server/src/vendor/shared

`client/src/vendor/ui/` is likewise vendored — see its own README before editing.

## Running and testing

**The Makefile is the interface** — `make help` is the catalog. Prefer a target
over the raw command it wraps: the fan-out targets encode the pnpm/npm split,
and getting that wrong corrupts a lockfile. The `dev-env` skill has the target
table and what to do when none fits.

`make dev` boots the whole stack; only Postgres runs in Docker. `make test` is
the no-Docker unit lane — the integration lane is separate and needs Docker.
Full suite map, per-package commands and conventions: @TESTING.md

- Integration tests are `*.it.test.ts` and need Docker; the unit lane excludes
  that glob. A test importing `server/test/helpers/pg.ts` must use the suffix.
- Prefer `server/src/adapters/mocks.ts` over real network or API keys.
- E2E specs are deterministic JSON (`e2e/specs/*.flow.json`) — never the AI
  `chat` command.
- **Never run `docker compose down -v` on your own initiative.** The `-v`
  deletes the `devdigest_pgdata` volume and every imported repo and review with
  it. It is the documented full reset (`README.md` → Troubleshooting), so run it
  when the user explicitly asks for one — never to "clean up" or fix a hang.
  `make stop` is the safe stop; for a clean DB, use `make e2e`'s ephemeral stack.

## Do not touch

These change only through the tool that owns them. Hand edits break things
far from the diff.

| Zone | Owner — the only way to change it |
|---|---|
| `server/src/db/migrations/**`, incl. `meta/_journal.json` | Edit `server/src/db/schema/`, then `pnpm db:generate` in `server/`. A merged migration is never edited; add a new one |
| `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml` | `pnpm install` / `pnpm add` in that package |
| `reviewer-core/package-lock.json`, `e2e/package-lock.json` | `npm install` in that package |
| `server/clones/**` | Runtime data written by the server; git-ignored |

A lockfile appears in a diff only as the by-product of a dependency change made
with that package's own manager. Running the wrong manager (see _Repo shape_)
creates a second, conflicting lockfile — delete that stray file, never commit
it.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| React component folder + file | PascalCase, colocated under `_components/` | `_components/FindingsPanel/FindingsPanel.tsx` |
| Per-component / per-module support files | fixed lowercase names | `helpers.ts` `constants.ts` `styles.ts` `index.ts` |
| Server module | kebab-case folder, fixed file roles | `modules/repo-intel/routes.ts` `service.ts` `repository.ts` |
| Hooks, lib files | kebab-case | `lib/hooks/repo-intel.ts` |
| Zod contracts and their types | PascalCase, same name for schema and type | `PrMeta`, `SeverityCounts` |
| API JSON fields | snake_case | `cost_usd`, `run_id` |
| DB | snake_case tables/columns in SQL, camelCase in Drizzle | `agent_runs.cost_usd` ↔ `agentRuns.costUsd` |
| i18n keys | camelCase, nested per feature file | `prReview.json` → `panel.hideLowConfidence` |
| Tests | `*.test.ts(x)` next to the code; DB-backed `*.it.test.ts` | `helpers.test.ts` |
| E2E flows | `NN-kebab.flow.json`, sequential | `e2e/specs/04-pr-findings.flow.json` |
| `.context/` files | kebab-case; specs `NN-kebab-slug.md` | `.context/specs/01-run-cost.md` |
| Commit subjects | `type(area): summary` | `fix(db): …`, `feat(conventions): …` |

## Conventions

- This repo is a **course starter**. `main` stays at the starter state;
  per-lesson work belongs in forks or feature branches.

## Where agent-facing material goes

Each package has a `.context/` directory:

- `.context/docs/` — reference material for that package
- `.context/specs/` — one file per planned or in-flight change
- `.context/insights/` — findings worth keeping, **committed and shared**

That last one is deliberately distinct from Claude Code's auto-memory, which is
machine-local and private. If a finding belongs to the team, it goes in
`insights/INSIGHTS.md` — one append-only file per package, under seven fixed
sections. The `engineering-insights` skill owns both halves of that loop.

Repo-wide material goes in this directory's `.context/`; anything scoped to one
package goes in that package's — a change spanning two packages is repo-wide.
One topic per file, kebab-case; specs are `NN-kebab-slug.md` and get deleted
once merged, because a stale spec that contradicts the code is worse than none.
Nothing goes in `docs/` that `README.md`, `TESTING.md` or `docs/agent-prompts/`
already covers.

`.context/` is yours; `.claude/` is Claude Code's. Settings, rules and the
vendored stack skills (react, fastify, drizzle, zod, …) live in `.claude/skills/`
and load on demand. Do not put project content there.

**Reading order** when you need background on a package — stop as soon as you
have the answer:

    .context/specs/  →  .context/docs/  →  .context/insights/INSIGHTS.md  →  source

`specs/` says what is changing now, `docs/` is settled reference, `INSIGHTS.md`
holds what is true but not visible in the code. Source is the fallback, not the
starting point.

## Session protocol

**Before working in a package**, read its `.context/insights/INSIGHTS.md` and say
in one line which file you read and whether it was relevant. Treat what it says
as high-confidence guidance unless told otherwise. A silent read gets skipped;
the sentence is what makes it real.

**When wrapping up**, run `/engineering-insights` to propose what the session
learned back into that file. Do not skip this step. It proposes; it writes only
what you approve, and a session with nothing non-obvious in it correctly writes
nothing.
