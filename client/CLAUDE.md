# `@devdigest/web` — Next.js 15 studio

UI route map and the API surface each route leans on:
[`README.md`](README.md)

Package manager is **pnpm**. Run from `client/`. Dev server is `:3000`; the API
base comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Where code goes

- **Pages are thin.** `src/app/**/page.tsx` wires data and layout, nothing else.
- **Feature logic sits in colocated `_components/<Name>/` folders**, each with
  its own `*.test.tsx`. The `_` prefix keeps them out of the route tree — a
  component folder inside `app/` must use it or Next will treat it as a route.
- **Cross-cutting chrome** is `src/components/app-shell` (nav, breadcrumbs,
  `g`-then-key shortcuts). Genuinely reusable, non-route components live in
  `src/components/`.

## Data access

Every network call goes through `src/lib/api.ts`, and every component reads it
through a TanStack Query hook in `src/lib/hooks/*` (`agents`, `core`,
`repo-intel`, `reviews`, `trace`). Do not call `fetch` from a component — the
test setup mocks `fetch` at the module boundary and a direct call will bypass
both the query cache and the tests.

## i18n

`next-intl`, messages in `messages/<locale>/*.json`, one file per feature area.
User-facing strings go in a message file, not inline in JSX. Adding a string
means adding the key to `messages/en/<area>.json`; the plugin is wired through
`src/i18n/request.ts` in `next.config.mjs`.

## Vendored code — do not edit casually

- `src/vendor/ui/` (`@devdigest/ui`) — vendored UI primitives, kit, charts,
  command palette, shell. Read [`src/vendor/ui/README.md`](src/vendor/ui/README.md)
  first.
- `src/vendor/shared/` (`@devdigest/shared`) — Zod contracts, a **duplicate** of
  `server/src/vendor/shared/` that has already drifted from it. Changing a
  contract here means changing the server copy too. See the root `CLAUDE.md`.

## Testing

`make test` covers this package — vitest + jsdom, `fetch` mocked, so it needs
no API, DB or browser.
Component tests assert rendering and interaction (React Testing Library), not
implementation detail. Real browser journeys live in
[`../e2e`](../e2e/README.md), not here. Details:
[`../TESTING.md`](../TESTING.md)

`make typecheck` runs `tsc --noEmit` here and is part of the CI gate.

## `.context/`

`docs/` reference · `specs/` planned changes · `insights/INSIGHTS.md` committed
findings, read and appended by the `engineering-insights` skill.
