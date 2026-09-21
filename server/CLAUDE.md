# `@devdigest/api` — Fastify + Drizzle/Postgres

API map, route diagram and module walkthrough: [`README.md`](README.md)

Package manager is **pnpm**. Run from `server/`.

## Adding a feature module

A module is a Fastify plugin at `src/modules/<name>/routes.ts` with a default
export. Register it with one import + one entry in `src/modules/index.ts` —
registration is **static on purpose**, not filesystem autoload, so the same code
path works under `tsx`, the bundler and vitest (`@fastify/autoload` is a
dependency but is not used for this). Adding a module should touch no other
module and no shared schema.

Within a module the file roles are fixed:

| File | Holds |
|---|---|
| `routes.ts` | the Fastify plugin: schemas, HTTP shape, no business logic |
| `service.ts` | business logic; depends on interfaces from the container |
| `repository.ts` | Drizzle queries; the only place SQL lives |
| `constants.ts` / `helpers.ts` | module-local values and pure helpers |

Cross-module pieces go in `src/modules/_shared/`, not into a sibling module.

## DI container

`src/platform/container.ts` holds config, db, the `JobRunner`, the SSE bus and
lazily-constructed adapters resolved through `SecretsProvider`. Services depend
on the **interfaces** from `@devdigest/shared`, never the concrete adapter class
— that is what lets tests inject mocks via `buildApp({ overrides })`.

Use `buildApp()` with `app.inject()` in tests rather than binding a real port.

## Adapters

Everything touching the outside world lives in `src/adapters/<capability>/`
behind an interface: `github`, `git`, `llm`, `embedder`, `codeindex`, `depgraph`,
`tokenizer`, `secrets`, `auth`, `astgrep`. Add a provider as a new file
implementing the interface; wire it in the container, not at the call site.

`src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitClient`) is the default for
tests — reach for it before any real network or key.

## Database

- Migrations are **generated** from `src/db/schema/`, never hand-written, and
  `src/db/migrations/meta/_journal.json` is never edited by hand (that journal
  has been corrupted before — see `fix(db)` in the log). The generate command
  has no target; see the `dev-env` skill.
- Never edit a migration that has merged; add a new one.
- Postgres runs in Docker with **pgvector**; `make db` migrates and seeds it.
- `server/clones/**` is runtime data, git-ignored, and collected by no suite.

## Contracts

`@devdigest/shared` resolves to `src/vendor/shared/` — a **vendored copy** that
`client` duplicates separately and that has already drifted from it. Changing a
contract here means changing `client/src/vendor/shared/` too. See the root
`CLAUDE.md`.

`@devdigest/reviewer-core` resolves to `../reviewer-core/src` as raw TypeScript.

## Testing

`*.it.test.ts` = integration: real Postgres via testcontainers, needs Docker,
self-skips without it. Everything else is the hermetic unit lane.

`make test` runs the unit lane, `make test-it` the integration one. `make
check` runs every lane CI runs except the browser e2e — reach for it before a
PR, because typecheck and the unit lane alone do not catch a webpack-only
client break. Its `build-web` step skips itself while `make dev` holds :3000;
stop the dev server to cover that lane.

A DB-backed test importing `test/helpers/pg.ts` **must** use the `.it.test.ts`
suffix or it will run in the unit lane and fail in CI. Details: [`../TESTING.md`](../TESTING.md)

## `.context/`

`docs/` reference · `specs/` planned changes · `insights/INSIGHTS.md` committed
findings, read and appended by the `engineering-insights` skill.
