# 05 — Response contracts at both ends

Add `response:` schemas to the Fastify routes and make the client parse what it
receives. Spans `server/` and `client/`, so it is repo-wide.

## Why

`CLAUDE.md` opens with *"Zod contracts at every boundary."* That holds on the
way **in** and nowhere on the way **out**.

Measured on L02, across all eight route modules:

| Module | routes | `schema:` | `response:` |
|---|---|---|---|
| agents | 11 | 13 | **0** |
| reviews | 10 | 10 | **0** |
| pulls | 4 | 4 | **0** |
| repos | 4 | 3 | **0** |
| settings | 4 | 2 | **0** |
| repo-intel | 2 | 2 | **0** |
| polling | 1 | 1 | **0** |
| workspace | 1 | 0 | **0** |
| **total** | **37** | **35** | **0** |

Three consequences:

1. **`app.ts` contains dead code.** It registers `serializerCompiler` and
   handles `isResponseSerializationError` — a branch that cannot fire while no
   route declares a response schema. Code that looks like a safety net and
   isn't is worse than no net.
2. **Nothing structurally prevents a leak.** A handler that returns a row
   instead of a DTO ships `workspaceId`, `createdBy`, and whatever else the
   row carries. Today the only thing standing between an internal column and
   the browser is the author remembering to map it in `helpers.ts`.
3. **Contract drift is invisible.** `modules/settings/routes.ts` annotates
   `Promise<SecretsStatus>` and is checked; most handlers annotate nothing, so
   the contract in `vendor/shared` and the bytes on the wire can diverge with a
   green typecheck.

On the client, `lib/api.ts` ends:

```ts
return (await res.json()) as T;
```

and `lib/types.ts` re-exports every contract with `export type`, so the Zod
schemas are erased at compile time. The client performs **zero** runtime
validation — confirmed by grep: no `.parse(` or `.safeParse(` anywhere under
`app/`, `components/` or `lib/`.

`onion-architecture` § Fastify is explicit: *"Use the Zod type provider
(`withTypeProvider<ZodTypeProvider>()`) for params, body, **and response** —
validation is the boundary, so it belongs at the edge."*

## What lands

### Server — the main half

One `response:` entry per route, reusing the contract that already exists in
`vendor/shared/contracts/`:

```ts
app.get('/agents', {
  schema: { response: { 200: z.array(Agent) } },
}, async (req) => { ... });
```

Order of work, easiest and highest-value first:

1. **`agents`** — the module the skill names as the reference implementation,
   and the one whose contracts are most complete. Doing it first makes the
   pattern copyable.
2. **`reviews`** — the largest surface and the one carrying findings, so the
   most to gain from a shape guarantee.
3. **`repos`**, **`pulls`**, **`repo-intel`**
4. **`settings`**, **`polling`**, **`workspace`** — smallest, and `workspace`
   has no schema at all today.

Expect this step to *find things*. A response schema failing on real data means
either the contract or the handler was already wrong; that is the change paying
for itself, and each instance is worth a line in the PR rather than a silent
fix.

**Error responses too.** `ApiErrorBody` is already a contract; declaring it for
the 4xx/5xx codes each route can actually produce documents the envelope that
`app.ts` builds.

### Server — the error-handler fallback

While in `app.ts`: the final branch returns `e.message ?? 'Internal error'` to
the client for any unrecognised throw. Driver errors, file paths and internal
identifiers reach the browser that way. Keep the message in the log, return a
generic string when `nodeEnv === 'production'`, keep the detail in development
where it is useful.

### Client — the smaller half

Give `apiFetch` an optional schema and parse when one is passed:

```ts
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  schema?: ZodType<T>,
): Promise<T>
```

On a parse failure, throw `ApiError` with status `0` and code
`contract_mismatch`, so it lands in the existing error taxonomy and the global
`QueryCache.onError` toast (`lib/providers.tsx`) surfaces it, rather than a
component rendering `undefined`.

Adopt it hook by hook, not all at once — start with `lib/hooks/reviews.ts`,
which feeds the findings panels and has the most fields.

**This half is optional if time is short.** Once the server declares response
schemas, the class of bug the client parse catches shrinks to "server and
client vendored copies drifted" — real, given the two-copy rule, but much
narrower.

## The two-copy rule applies

Any contract touched here exists twice:

```sh
diff -r client/src/vendor/shared server/src/vendor/shared
```

Five files already differ (`adapters.ts`, `contracts/{eval-ci,knowledge,
productionize,trace}.ts`). That is the documented baseline — **do not
reconcile it as a side effect of this change**. Only keep the files this spec
touches in sync.

## Verification

```sh
make typecheck
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
cd server && pnpm exec vitest run .it.test    # the real proof — needs Docker
```

The integration lane is what matters: it drives routes end-to-end against real
Postgres rows, so a response schema that disagrees with reality fails there and
nowhere else.

## Non-goals

- **No contract redesign.** The schemas in `vendor/shared` are taken as given.
  Where one is wrong, fix that one and say so; do not restructure.
- **No OpenAPI generation.** `fastify-type-provider-zod` makes it possible once
  response schemas exist, which is a nice second-order benefit, not this spec.
- **No reconciling the five drifted vendor files.**
- **No client parse in components.** Parsing belongs in `api.ts`, the single
  transport, per `frontend-architecture` § Data.
