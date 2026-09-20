# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the web package but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

### 2026-09-20 — `loading.tsx` cannot cover a TanStack Query fetch — keep the in-page `isLoading` branch

**What:** Every page in this app is `"use client"` and gets its data from
TanStack Query; nothing fetches on the server and no query uses `suspense`. A
`loading.tsx` is a **server-side** Suspense fallback: it shows while the
segment's RSC payload streams and has already resolved by the time the browser
has HTML. It never sees the client-side query.

So the route's `loading.tsx` and the page's own `isLoading` branch cover two
different moments and BOTH are needed. Deleting the in-page branch — the
obvious "the framework owns this now" cleanup — leaves an empty page for the
whole duration of every client fetch. The shared shape lives in a component
(`PrDetailSkeleton`) that both render, so there is one skeleton, not two.

**Why:** Measured, not reasoned: `curl` the served HTML for `/agents` and the
page's own header and search box are in it, which means the page rendered
server-side with `isLoading` true and the `loading.tsx` fallback was never what
the browser received.

**Rejected:** Moving the skeletons out of the pages into `loading.tsx` and
deleting the branches. It reads like the framework-idiomatic move and is a
regression here. It only becomes right if the pages ever fetch on the server.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — A **Server Component must not import the `@devdigest/ui`
  barrel.** The barrel reaches `recharts`, and pulling that into the RSC graph
  throws `TypeError: Super expression must either be null or a function` from
  `recharts/es6/component/TooltipBoundingBox.js` — a stack that names neither
  your file nor the barrel. Every `loading.tsx` / `not-found.tsx` here is
  therefore `"use client"`, matching the route-rung boundary the rest of the app
  already uses.

- **2026-09-20** — A **value** import from `@devdigest/shared` (the Zod schemas,
  not `import type`) breaks the Next build without
  `resolve.extensionAlias { ".js": [".ts", ".tsx", ".js"] }` in
  `next.config.mjs`. The vendored barrel is TypeScript source using
  `./contracts/findings.js` specifiers that point at `.ts` files; tsc
  (`moduleResolution: "Bundler"`) and vitest both map those, **webpack does
  not**. It stayed hidden for as long as every import was `import type`, which
  is erased before webpack sees it. `pnpm typecheck` and `pnpm test` both pass
  while the dev server and `next build` fail with
  `Module not found: Can't resolve './contracts/findings.js'` — so a change that
  starts importing a schema has to be opened in a browser, not just type-checked.
  `client/next.config.mjs`

- **2026-09-20** — `NextIntlClientProvider` in `app/layout.tsx` is handed
  `pick(messages, USED_NAMESPACES)`, not the whole `getMessages()` result. A new
  `messages/en/<ns>.json` is loaded by `i18n/request.ts` automatically but will
  **not reach the client** until its name is added to that list — the failure is
  a missing-message error at render, not a build error.

- **2026-09-20** — `messages/en/onboarding.json` is the **Onboarding Tour**'s
  copy (an L05 design reference), NOT the `/onboarding` add-repository screen's.
  They share only a route name. That screen reads `addRepo`. Do not merge them.

- **2026-09-20** — next-intl rich text uses XML-like **tags**, not placeholders:
  `t.rich("body", { link: (chunks) => <a>{chunks}</a> })` needs
  `"… <link>text</link> …"` in the JSON. Writing `{link}` interpolates a value
  instead and the element silently renders as nothing — no error, just missing
  copy.

- **2026-09-20** — The client's vendored `contracts/knowledge.ts` does **not**
  export `AgentVersion`; the server's copy does. This is part of the documented
  five-file drift baseline (`diff -r client/src/vendor/shared
  server/src/vendor/shared`) and is deliberately NOT reconciled — nothing in
  the web app calls `/agents/:id/versions`. If you write a cross-copy contract
  check, exclude it, or the check fails on accepted debt rather than on a real
  regression.

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
