# onion-architecture — sources and rationale

For whoever next changes this skill: where each rule came from, and what it is
defending against.

## Why this skill exists

The server was *already* onion-shaped when the skill was written — ports in
`vendor/shared/adapters.ts`, a composition root in `platform/container.ts`,
adapters isolated under `src/adapters/`, a pure engine in `reviewer-core/`. What
it lacked was a name, a written rule, and anything that would notice a
violation. Four modules had already drifted (see SKILL.md § Known exceptions),
and nothing flagged it.

So the skill is deliberately **descriptive first, prescriptive second**: it
names rings that exist rather than importing a generic
`domain/application/infrastructure` layout that would fight the repo's
`modules/*` convention.

## Foundational

- [The Onion Architecture: part 1 — Jeffrey Palermo (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
  — the original. Two claims we lean on: *behaviour is defined by interfaces*,
  and *infrastructure is externalised*. Also the caveat that the pattern is
  aimed at long-lived applications with complex behaviour, not small sites —
  which is why routes/service/repository is required per module but a fifth
  ring of use-case objects is not.
- [Onion Architecture — Herberto Graça, *Software Architecture Chronicles*](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)
  — the clearest breakdown of the rings and how they relate to DDD.
- [Hexagonal architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture)
  — ports & adapters (2005). The vocabulary `vendor/shared/adapters.ts` was
  already using. Source of the "routes and adapters are peers, not a stack"
  framing in the ring table: inbound and outbound adapters sit on the same
  outer edge.
- [Clean vs Onion vs Hexagonal — Milan Jovanović](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal)
  — the three are cousins sharing the inward-dependency rule and differing
  mostly in naming. We adopt Onion's ring names and Hexagonal's ports/adapters
  terminology, and skip Clean Architecture's mandatory use-case objects.
- [Sliced Onion Architecture — Oliver Drotbohm (2023)](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/)
  — rings *inside* vertical modules rather than across the whole app. This is
  the single most load-bearing reference: it is exactly DevDigest's
  `modules/<feature>/{routes,service,repository}.ts` shape, and it is the
  argument for why the rings are per-module and not top-level folders.
- [Demystifying software architecture patterns — Thoughtworks](https://www.thoughtworks.com/en-de/insights/blog/architecture/demystify-software-architecture-patterns)

## TypeScript / Node practice

- [Implementing SOLID and the onion architecture in Node.js with TypeScript — Wolk Software](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs)
  — the canonical Node treatment. We take the dependency-inversion discipline
  and **reject** the IoC-container-with-decorators approach: `container.ts`'s
  lazy getters plus `ContainerOverrides` already give constructor injection and
  test seams without InversifyJS or `reflect-metadata`.
- [Clean architecture with TypeScript: DDD, Onion — André Bazaglia](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- [Hexagonal Architecture guide + TypeScript](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide)

## Tool-specific

- [The complete guide to the Fastify plugin system — Nearform](https://nearform.com/digital-community/the-complete-guide-to-fastify-plugin-system/)
  and [Fastify Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
  — encapsulation as the module boundary; children inherit ancestors, siblings
  are isolated. Source of the "`fastify-plugin` only for app-wide
  infrastructure" rule: wrapping in `fastify-plugin` deliberately *breaks*
  encapsulation, so every use is a hole in a boundary.
- [Atomic Repositories in Clean Architecture and TypeScript — Sentry](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
  — transactions spanning repositories without leaking the ORM.
- [You might not need… the repository pattern — Jay Freestone](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b)
  — the counter-argument, included on purpose. A repository is only worth it if
  it protects a real boundary or hides real persistence complexity; otherwise
  it is a thin leaky wrapper. This is why the skill demands repositories return
  DTOs and translate errors rather than merely demanding the file exist.
- [Drizzle ORM best practices — Paul Serban](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
  — and the framing that Drizzle is a *typed query builder* more than an ORM,
  which is why leaking it is so easy and the boundary has to be explicit.
- [Drizzle discussion #232 — further abstractions](https://github.com/drizzle-team/drizzle-orm/discussions/232)

## Enforcement tooling

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — chosen
  because it is **already a `server/` dependency** (v17, used by the repo-intel
  import-graph adapter), so the ruleset added a config file and no package.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
  — the alternative, rejected for now: the server has no ESLint config at all,
  so adopting it would mean introducing a linter as well as a ruleset.

### Gotchas found while writing the config

Both cost a debugging round-trip; do not reintroduce them.

- **pnpm path anchoring.** `to.path` is matched against the *resolved* path,
  which under pnpm is `node_modules/.pnpm/openai@4.104.0_.../node_modules/openai/index.js`.
  A rule written as `^openai` or `^node_modules/drizzle-orm` silently matches
  nothing and the rule looks green. Write `node_modules/openai` — no `^`.
- **A rule that never fires looks identical to a rule that passes.** Every
  error-level rule in the config was validated by planting a temporary
  violation, confirming the error, and removing it. Do that again after editing
  the ruleset.

## Decisions taken when the skill was written (2026-09-20)

| Decision | Choice | Why |
|---|---|---|
| Scope | `server/` rings, plus one purity rule for `reviewer-core` | `reviewer-core` is the purest ring and currently imports zero Node builtins; the rule preserves a property that already holds |
| Existing violations | Recorded as dated, named debt; exempted by name in the lint config | An error-level rule is worth more than a clean slate. Exempting four files by name keeps the rule live for everything else and makes the debt machine-readable |
| `no-circular` severity | `warn`, not `error` | Two real cycles predate the config; erroring would make the lint unusable on day one |
| Enforcement depth | Ruleset shipped and verified; no `make` target | Per the `dev-env` skill, a target is proposed as a diff and written once accepted — a path walked once stays raw |
| IoC container | None | `platform/container.ts` already provides constructor injection and test overrides |
