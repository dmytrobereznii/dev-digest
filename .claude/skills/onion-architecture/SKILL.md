---
name: onion-architecture
description: >-
  DevDigest's backend ring model — contracts → ports → services →
  repositories → adapters and routes, with dependencies pointing inward only.
  Use when adding or changing anything under server/src/modules/**,
  adapters/**, platform/**, db/**, or vendor/shared/**: a new endpoint, a new
  external integration, a new table, or a refactor that moves logic between
  routes, service, and repository. Also use when deciding where a piece of
  backend code belongs.
---

# onion-architecture

The server is already an onion; this skill names the rings and keeps new code
inside them. Worked good/bad pairs from this repo:
[`examples.md`](examples.md). Sources and rationale:
[`references.md`](references.md).

## The rule

**Source dependencies point inward.** An outer ring may name an inner one. An
inner ring may never name an outer one — it declares an interface and waits to
be handed an implementation.

```
routes.ts ──▶ service.ts ──▶ repository.ts ──▶ db/
    │              │
    │              └──▶ ports (vendor/shared/adapters.ts) ◀── adapters/
    └─────────────────▶ contracts (vendor/shared/contracts/) ◀── everything
```

Only the **composition root** — `platform/container.ts` and `app.ts` — is
allowed to know both a port and the concrete class that satisfies it.

## The rings, as real directories

| Ring | Lives in | May import | Rule |
|---|---|---|---|
| 1 — Contracts | `vendor/shared/contracts/` | `zod`, sibling contracts | Nothing else. Ever. |
| 1 — Engine | `reviewer-core/src/` | contracts, `zod`, `openai` types | No `fs`, no `node:*`, no DB, no network except through the injected `LLMProvider` |
| 2 — Ports | `vendor/shared/adapters.ts`, `modules/repo-intel/types.ts` | ring 1 | Interfaces only — no implementation, no import of `src/**` |
| 3 — Application | `modules/*/service.ts`, `platform/*` | rings 1–2, own repository | Speaks contracts and DTOs; never sees a SQL table |
| 4 — Infrastructure | `adapters/**`, `db/**`, `modules/*/repository.ts` | rings 1–3 | The only place a vendor SDK or Drizzle appears |
| 4 — Delivery | `modules/*/routes.ts` | own service, contracts, `platform/errors` | HTTP shape only |
| 5 — Composition root | `platform/container.ts`, `app.ts` | everything | The only file allowed to `new` a concrete adapter |

Note the shape: rings 4 and 5 are *outside*, not on top. `adapters/` and
`routes.ts` are peers — one adapts the world to the app, the other adapts the
app to the world.

## Where does this code go?

1. Does it touch the network, the filesystem, or Postgres? → **ring 4**: an
   adapter (outbound) or a repository (persistence). Never anywhere else.
2. Does it decide *what* should happen — orchestration, policy, permissions,
   sequencing? → **ring 3**, `service.ts`.
3. Is it pure computation over contracts? → `reviewer-core/` if it is review
   logic, `platform/` if it is a backend concern (pricing, routing, tracing).
4. Is it about the HTTP wire — status codes, snake_case bodies, param parsing?
   → `routes.ts` plus `helpers.ts` for the mapping.
5. Is it a type two rings share? → **ring 1**, a contract. Both vendored copies
   (see below).

## Per-tool rules

### Fastify — routes are adapters, not logic

A handler validates, calls **one** service method, and returns. The module's
reference implementation is `modules/agents/routes.ts`.

- Use the Zod type provider (`withTypeProvider<ZodTypeProvider>()`) for params,
  body, and response — validation is the boundary, so it belongs at the edge.
- Throw `platform/errors.ts` types (`NotFoundError`, `ValidationError`); the
  error handler in `app.ts` turns them into the `ApiErrorBody` envelope. Never
  hand-roll `reply.code(404).send({...})`.
- **Budget:** a handler body over ~15 lines, or one that names a database
  table, has logic in it. Move it down a ring.
- Fastify's encapsulation already scopes each module. Reach for
  `fastify-plugin` only for genuinely app-wide infrastructure — the container
  decorator in `app.ts` is the one legitimate case.

### Drizzle — the query stops at the repository

- `drizzle-orm` and `db/schema.js` are importable from `repository.ts` and
  `db/**`. Nowhere else.
- A repository returns **domain or DTO shapes**, never a query builder, never a
  raw Drizzle error. Translate constraint violations into `platform/errors.ts`
  at that edge — otherwise the service has to understand Postgres to handle
  them, and the abstraction has bought nothing.
- Row types (`db/rows.ts`) are persistence detail. A service that imports
  `AgentRow` is reaching outward; map to a DTO in `helpers.ts` instead.
- Split by aggregate when a repository grows, the way `modules/reviews/`
  already does (`repository/pull.repo.ts`, `review.repo.ts`, `run.repo.ts`).
- Schema changes go through `db/schema/` + `pnpm db:generate`. Migrations are
  never hand-edited.

### Zod — one schema, two jobs

- Contracts are ring 1 and stay dependency-free: `zod` and sibling contracts,
  nothing more. A contract that imports a port has inverted the onion.
- Define the schema once and infer the type (`PrMeta`, `SeverityCounts`) rather
  than declaring both.
- Parse at the boundary; pass the parsed type inward. Services receive values
  that are already valid — they should not re-validate, and should not accept
  `unknown`.
- The API speaks snake_case, Drizzle speaks camelCase. That mapping is edge
  work: it belongs in `helpers.ts`, not in the service.

### Octokit · OpenAI · Anthropic · simple-git · ast-grep — behind a port

No vendor SDK is imported outside `src/adapters/`. Today that holds for all
five. Adding an integration is always these four steps, in order:

1. **Port** — an interface in `vendor/shared/adapters.ts` (**both** vendored
   copies; see below).
2. **Adapter** — the implementation in `adapters/<name>/`, the only file that
   imports the SDK.
3. **Wiring** — a lazy getter in `platform/container.ts` plus an entry in
   `ContainerOverrides`, so tests can inject.
4. **Mock** — a fake in `adapters/mocks.ts` implementing the same interface.

Existing ports: `LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`,
`CodeIndex`, `AuthProvider`, `SecretsProvider`, plus the `RepoIntel` facade in
`modules/repo-intel/types.ts`.

Not every file under `adapters/` is an I/O client — `git/diff-parser.ts`,
`codeindex/extract.ts`, and `astgrep/` are pure functions, and importing those
from a module is fine. Importing a *credentialed client* (`llm/`, `github/`,
`secrets/`, `auth/`, `embedder/`, `git/simple-git`) is not: get it off the
container.

### Dependency injection

- Services take their dependencies in the constructor. `container.ts` is the
  only file that constructs concrete adapters.
- Prefer injecting the **ports a service actually uses** over the whole
  `Container`. Passing `Container` is the current convention and is acceptable,
  but it is what creates the `repo-intel/service ↔ container` cycle the linter
  warns about — new services should take what they need.
- No service-locator lookups buried in a call stack. If a function needs a
  port, it is a parameter.

## `@devdigest/shared` is vendored twice

`client/src/vendor/shared/` and `server/src/vendor/shared/` are separate copies
and **have already drifted** (`adapters.ts` differs in `StructuredRequest`,
`LLMProvider.id`, and the commit-files types). Changing a ring-1 contract means
changing both. Diff before assuming:

```sh
diff -r client/src/vendor/shared server/src/vendor/shared
```

## Enforcement

The rings are encoded as lint rules in
[`server/.dependency-cruiser.cjs`](../../../server/.dependency-cruiser.cjs).
`dependency-cruiser` is already a server dependency, so this costs nothing to
run:

```sh
cd server && pnpm exec depcruise src
```

**The baseline is 0 errors** (15 warnings, all listed below). A new error is
something this change introduced. Error-level rules, each verified to fire:

| Rule | Catches |
|---|---|
| `sdk-outside-adapters` | a vendor SDK imported outside `src/adapters/` |
| `sql-in-routes` | `drizzle-orm` or `db/schema` in a route handler |
| `routes-skip-service` | a route importing a repository directly |
| `io-adapter-in-module` | a credentialed adapter imported by name |
| `contracts-stay-pure` | ring 1 importing anything but `zod` |
| `ports-know-no-implementations` | `vendor/shared` reaching into `src/**` |

No `make` target wraps this yet. If it earns one:

```make
lint-arch: ## Check the onion-architecture boundaries (server)
	cd server && pnpm exec depcruise src
```

Grep fallback when the config is unavailable:

```sh
cd server/src
grep -rn --include='*.ts' -E "from '(openai|octokit|simple-git)'|@anthropic-ai|@octokit|@ast-grep" . | grep -v '^\./adapters/'
grep -rln "drizzle-orm\|db/schema" modules/*/routes.ts
```

## Known exceptions — accepted debt, 2026-09-20

These predate the skill. **Do not fix them as a side effect of unrelated
work** — they are listed so an agent recognises them as known rather than
"discovering" them mid-task. Fix one only when the task is that module, or when
asked.

| Where | What | Target shape |
|---|---|---|
| `modules/pulls/routes.ts` (363 lines) | Drizzle queries inline in handlers; no service, no repository | Extract `service.ts` + `repository.ts`; it is the largest and highest-value of the four |
| `modules/settings/routes.ts`, `modules/polling/routes.ts`, `modules/workspace/routes.ts` | Same, smaller | Same |
| `modules/reviews/service.ts`, `run-executor.ts`, `diff-loader.ts`, `repos/helpers.ts` | Import `db/schema` / `db/rows` from ring 3 | Map rows to DTOs at the repository edge |
| `repo-intel/service ↔ platform/container` | Cycle via whole-`Container` injection | Inject the ports the service uses |
| `agents/helpers.ts ↔ agents/repository.ts` | Cycle | Move the shared predicate into `constants.ts` or a pure helper |

The four route files are exempted **by name** in the lint config so
`sql-in-routes` can be an error for everything else. That list shrinks; it
never grows.

## Checklist — adding a module

Reference implementation: `modules/agents/` (`routes.ts` → `service.ts` →
`repository.ts` → `helpers.ts` → `constants.ts`).

- [ ] `routes.ts` — Zod schemas, `getContext`, one service call per handler
- [ ] `service.ts` — orchestration; takes its dependencies in the constructor
- [ ] `repository.ts` — the only file importing `drizzle-orm` / `db/schema`
- [ ] `helpers.ts` — row → DTO, camelCase → snake_case
- [ ] `constants.ts` — defaults and magic values
- [ ] Registered in `modules/index.ts`
- [ ] New external call? port + adapter + container getter + mock
- [ ] `pnpm exec depcruise src` still reports 0 errors
- [ ] `pnpm typecheck`, and the unit lane for the package
