---
name: frontend-architecture
description: >-
  Where code goes in DevDigest's web app — components, hooks, constants,
  helpers, state, contracts and the client boundary. Use when adding to or
  refactoring anything under client/src/**, or when deciding where a piece of
  frontend code belongs.
---

# frontend-architecture

The server is an onion; the web app is a **ladder**. This skill names the rungs
and keeps new code on the lowest one that works. Worked good/bad pairs:
[`examples.md`](examples.md). Greps and lint options for checking compliance:
[`enforcement.md`](enforcement.md). Sources and rationale:
[`references.md`](references.md).

Scope is *placement* — where code lives and what owns it. Hook misuse,
derive-don't-store and rendering cost belong to
[`react-best-practices`](../react-best-practices/SKILL.md); special-file
semantics and RSC prop rules to
[`next-best-practices`](../next-best-practices/SKILL.md).

**One override.** `react-best-practices` prescribes a container/presentational
split. This skill forbids it as a file convention (see § Components); the
pattern's author retracted it and hooks replaced it. On component structure,
this file wins.

## The rule

**Distance equals consumers.** Code lives beside its only consumer and moves
outward exactly one rung when a second consumer appears — never before.

```
_components/<Name>/  ──▶  route folder  ──▶  src/components · src/lib  ──▶  src/vendor/*
   one component           one route            two or more routes          two or more packages
```

"Never before" is the load-bearing half: a helper hoisted ahead of its second
consumer outlives the death of its first, and nothing ever deletes it. Wait
until the duplication is concrete, then move.

## The rungs, as real directories

| Rung | Lives in | Holds | Promote when |
|---|---|---|---|
| 0 — Component | `app/**/_components/<Name>/` | `<Name>.tsx` plus its own `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, tests | a sibling component in the same route needs it |
| 0 — Nested | `<Name>/_components/<Child>/` | a child only `<Name>` renders | a second component renders it |
| 1 — Route | beside `page.tsx`, e.g. `app/repos/[repoId]/pulls/` | `constants.ts`, `helpers.ts`, `styles.ts` shared by that route's `_components` | a second route needs it |
| 2 — App | `src/components/<kebab-name>/`, `src/lib/**` | cross-route components; the API client, query hooks, contexts | a second package needs it |
| 3 — Vendored | `src/vendor/ui`, `src/vendor/shared` | design system, Zod contracts | — see § Types |

Rung 0 exists because `_components` is opted out of routing: a component can
sit inside a route segment without becoming a URL.

## Where does this code go?

1. Renders UI? → a component at the lowest rung with a consumer. § Components
2. A magic value? → `constants.ts` at that rung. § Constants
3. A pure function over the data being rendered? → `helpers.ts` at that rung.
   § Helpers
4. Calls hooks? → a hook. § Hooks
5. Talks to the API? → § Data
6. A type that crosses the API? → § Types
7. Style? → `styles.ts` at that rung, or the vendored kit if it is a primitive.

## Components

- Split on responsibility, not size, and not before you feel the problem. A
  growing component is cheaper than a premature abstraction.
- One exported component per file, named the same as the file and the folder.
- **Budget:** more than ~7 props, or more than two booleans that combine, means
  the component does too much. Each boolean doubles the state space.
- Express variants as explicit components that compose shared internals, rather
  than as boolean flags on one component.
- Prefer `children` over a `renderX` prop for static structure. Keep a render
  prop where the parent must receive data back.
- **A `*Container.tsx` / `*View.tsx` split is not a convention here.** What it
  bought — UI that doesn't know where its state comes from — is bought instead
  by a query hook or a context provider.
- A page (`page.tsx`) is a composition root: resolve params, call hooks, hand
  data down. Logic in a page belongs in a colocated `_components/` view.

## Constants

- Component-scoped constants live in that component's `constants.ts`, each with
  a one-line doc comment. `helpers.ts` imports from `./constants`; the reverse
  is a cycle.
- A constant used by two components in one route moves to the route's
  `constants.ts`. One used by two routes moves to `src/lib/`.
- Only `NEXT_PUBLIC_`-prefixed environment variables reach the browser. The API
  base is the single one, read in `src/lib/api.ts`; components read no
  `process.env`.

## Helpers

- `helpers.ts` holds pure functions. If it needs a hook, it is a hook.
- A helper called by one component stays in that component's folder however
  long it gets. Length is not a promotion trigger; a second caller is.
- Name a non-hook function `get*` / `format*` / `filter*`. The `use` prefix is
  what tells the linter and the reader where hooks can hide.
- Pure helpers get their own `helpers.test.ts`. That is the point of extracting
  them.

## State

The decision tree, in order. Stop at the first line that fits:

1. Computable from props or existing state? → compute it in render. Not state.
2. Used only inside this component? → `useState` here.
3. Used by one child? → keep it here, pass it down.
4. Used by a sibling? → lift to the closest common parent.
5. Should it survive a reload or be linkable? → the URL, as this app already
   does with `?tab=` via `useSearchParams`.
6. Comes from the API? → it is server cache, not state. It belongs to TanStack
   Query, and a query result is never copied into `useState`.
7. Genuinely cross-cutting (theme, toasts, active repo)? → a small
   domain-scoped context in `src/lib/`, with a hook that throws when used
   outside its provider.

Two rules fall out of it:

- **No global client store.** Server state is in the query cache and UI state
  is colocated; what is left is tiny. Adding Redux, Zustand or Jotai needs a
  named reason.
- Render each provider as deep as it is needed, not at the root by reflex.

## Hooks

- `src/lib/hooks/` is the home of every data hook, one file per domain.
- Keep a custom hook when it adds a `select`/transform, derived flags, or a
  stable component-facing contract. A hook whose whole body is
  `useQuery(someOptions)` earns little.
- The query key is a dependency array. Every variable the query function uses
  is in it, and the key lives beside the query, not in a global `queryKeys.ts`.
- Structure keys most-generic to most-specific (`["pr-runs", prId]`) so a broad
  `invalidateQueries` does the right thing.
- A hook that calls no other hook is a helper. Rename it and move it.

## Data and the API layer

- One transport: `src/lib/api.ts`. It normalizes failures to `ApiError` so the
  UI can branch on status. A component that calls `fetch` has skipped a rung.
- This app is Next's **External HTTP APIs** shape, a separate Fastify service.
  That is a sanctioned approach for an existing backend, not debt awaiting
  migration. Keep to it rather than mixing in a second data approach.
- Client-side fetching stays correct for the two things this app does most:
  frequently polled data (run status, traces) and anything touching browser
  APIs.
- SSE is the one transport outside `api.ts`: `EventSource` is opened inside a
  hook in `src/lib/hooks/`, and its events feed the query cache. Open a stream
  in a hook, not in a component.

## Types and contracts

- Every shape crossing the API comes from `@devdigest/shared`. `src/lib/types.ts`
  is for client-only types.
- Contracts are Zod schemas with the type inferred from the schema, one
  declaration rather than two.
- `@devdigest/shared` is **vendored twice** and the copies have already
  drifted. Changing a contract means changing both:

  ```sh
  diff -r client/src/vendor/shared server/src/vendor/shared
  ```

- The API speaks snake_case, React camelCase. That mapping is edge work and
  belongs in `helpers.ts`.

## The server/client seam

- `"use client"` marks the **entry to a client subtree**. Everything imported
  from that entry is already in the client graph; repeating the directive
  inside it is noise.
- Push the directive toward the leaves. A route's shell can stay a Server
  Component while its interactive view does not. `app/agents/page.tsx` is the
  shape to copy: a server page rendering one colocated client view.
- Rendered elements are data, so `children` lets a server subtree sit inside a
  client component without entering the client graph. That is the tool for
  moving the boundary down.
- **Compound components break across the seam.** A Server Component importing a
  Client Component gets a client reference, so `Menu.Item` is `undefined` and
  React throws `Element type is invalid`. Expose named exports rather than
  static properties — a live constraint on `src/vendor/ui`.
- Context cannot be created in a Server Component. A provider is rendered from
  one, which is what `app/layout.tsx` does.
- Pass a client component the minimum it renders, rather than a whole record
  because it was already loaded.

## Naming, imports and barrels

- Component folder and file PascalCase (`FindingsPanel/FindingsPanel.tsx`);
  support files fixed lowercase (`constants.ts`, `helpers.ts`, `styles.ts`,
  `index.ts`); hooks and lib files kebab-case.
- **Use the `@/` alias** in place of `../../../../lib/hooks`. A new alias goes
  in both `client/tsconfig.json` and `client/vitest.config.ts` — miss one and
  tests break while the app still builds.
- Two kinds of barrel exist here and they are **not one decision**:
  - A one-line forwarder for a single component folder
    (`export { X, X as default } from "./X"`) is cheap and keeps imports
    readable. Keep it.
  - An **aggregating** barrel re-exporting many modules (`src/lib/hooks/index.ts`)
    pulls all of them in synchronously and invites `module → index → module`
    cycles. Add no more; import `@/lib/hooks/<domain>` directly.
- `export * from "./X"` and `export { default } from "./X"` in one file is a
  build error under the App Router: `the name 'default' is exported multiple
  times`.
- `optimizePackageImports` is for third-party packages with hundreds of
  modules. It does not rescue your own directories, and it stops working
  silently once a barrel contains one non-re-export line.

## Testing

- Tests are colocated: `<Name>.test.tsx` beside the component, `helpers.test.ts`
  beside the helpers. The repo has no mirrored test tree.
- Test the component through its rendered output and the pure helpers directly.
  The split exists so both are cheap.
- `fetch` is mocked; the suite needs neither the API nor Docker. Real browser
  journeys live in `e2e/`, outside `src/`.

## Known exceptions — accepted debt, 2026-09-20

These predate the skill and are listed so an agent recognises them as known
rather than rediscovering them mid-task. Leave them alone unless the task is
that code.

| Where | What | Target shape |
|---|---|---|
| Most `page.tsx` files and their trees | `"use client"` sits at the route, not the leaves | Convert page shells to Server Components, keep polling subtrees client. `app/agents/page.tsx` and `app/settings/[section]/page.tsx` already show it |
| Deep relative imports outnumber `@/` imports | The alias is configured but underused | Use `@/` in new code; convert files you already touch |
| `src/lib/hooks/index.ts` | Aggregating barrel | Import `@/lib/hooks/<domain>` directly in new code; the barrel stays for existing callers |
| `src/components/{app-shell,showcase,page-shell}/index.ts` | `export *` over a single module each, harmless today | Leave, and add no `export { default }` line to them |

## Checklist — adding a feature to a route

Reference implementation: `app/agents/` — server `page.tsx` → colocated
`_components/AgentsListView/` (view, `constants.ts`, `helpers.ts`, `styles.ts`,
`index.ts`, nested `_components/CreateAgentModal/`).

- [ ] Every § *Where does this code go?* question answered for the new code
- [ ] `helpers.test.ts` for the pure helpers, `<Name>.test.tsx` for the component
- [ ] `"use client"` only at the subtree entry; the page stays a shell if it can
- [ ] `@/` imports, and no new aggregating barrel
- [ ] `pnpm typecheck` and `pnpm test` pass from `client/`
