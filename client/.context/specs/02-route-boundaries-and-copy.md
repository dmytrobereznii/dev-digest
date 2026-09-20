# 02 — Route boundaries, message payload, and the copy that escaped i18n

Three separable frontend changes that share one root: the App Router's own
conventions are unused, so each page re-implements them by hand.

## Why

### No `error.tsx`, `loading.tsx` or `not-found.tsx` — anywhere

Seven `page.tsx` files, one `layout.tsx`, and **zero** of Next's other special
files. Two consequences:

- **A throw in any page is a white screen.** There is no error boundary between
  a component and the browser. `next-best-practices` treats `error.tsx` as the
  route-level boundary, and the app has none at any level.
- **Every page hand-rolls loading and error states.**
  `app/repos/[repoId]/pulls/[number]/page.tsx` spends roughly 40 of its 185
  lines on `isLoading` / `isError` branches with inline `<Skeleton>` layouts —
  logic the framework would own for free.

`app/layout.tsx` wraps children in `<Suspense fallback={null}>`, which is the
seam a `loading.tsx` would fill properly.

### Every message namespace ships to every page

`app/layout.tsx` passes the whole `getMessages()` result into
`NextIntlClientProvider`, and `src/i18n/request.ts` builds that by
`readdirSync`-ing the entire `messages/en/` directory. So all **18** namespaces
are serialized into the RSC payload on every navigation.

**Eleven of the eighteen are imported by nothing:**

`agentPerformance` · `blast` · `brief` · `ci` · `compose` · `conformance` ·
`context` · `conventions` · `eval` · `memory` · `skills`

They are copy for lesson features that do not exist yet (L03–L08) — roughly
16 KB of JSON on every page load, for surfaces that cannot be reached.
`onboarding.json` is a twelfth: the route `app/onboarding/` exists, but
`AddRepoView.tsx` never calls `useTranslations`, so the file is dead too.

The directory-reading loader is a good design — `request.ts` documents that it
exists so *"feature agents add their own `messages/en/<feature>.json` without
touching shared code"*. The problem is only that nothing narrows the result
before it crosses to the client.

### The top-level pages bypass i18n

36 of 64 components under `app/` and `components/` call `useTranslations`. The
misses cluster in exactly the wrong place — the pages themselves:

| File | Hardcoded |
|---|---|
| `pulls/[number]/page.tsx:115` | `"Couldn't load this pull request"` |
| `pulls/[number]/page.tsx:116` | `` `PR #${number} could not be loaded.` `` |
| `pulls/[number]/page.tsx:85` | `"Pull Requests"` (breadcrumb) |
| `pulls/[number]/page.tsx:153` | `"Delete this run from history? (its logs are removed too)"` |
| `onboarding/_components/AddRepoView/` | the whole surface |

`frontend-architecture` § Copy: *"Every user-visible string goes through
next-intl … There is a single locale and no locale routing. That is a reason to
keep strings out of components, not a reason to skip the namespace."*

### `window.confirm` for a destructive action

`pulls/[number]/page.tsx:153` gates run deletion on `window.confirm`. It blocks
the event loop, cannot be styled or translated, and cannot be driven by RTL —
so the delete path is untestable. The app already has `ToastProvider`
(`lib/toast.tsx`) and a modal pattern (`CreateAgentModal`).

## What lands

### 1. Route boundaries

```
app/error.tsx                              # global boundary, "use client"
app/not-found.tsx
app/repos/[repoId]/pulls/[number]/loading.tsx
app/repos/[repoId]/pulls/loading.tsx
app/agents/loading.tsx
```

`error.tsx` must be a Client Component and takes `{ error, reset }` — wire
`reset` to the existing `ErrorState`'s `onRetry` so the look matches what the
pages already render.

Each `loading.tsx` moves that route's existing `<Skeleton>` block out of the
page. This is the step that actually shrinks the pages; adding the files
without deleting the hand-rolled branches would make things worse, not better.

`RepoNotFound` (`components/repo-not-found/`) already exists and is rendered
manually on a stale `:repoId`; `not-found.tsx` plus `notFound()` is where that
belongs.

### 2. Narrow the message payload

`next-intl`'s `pick` on the provider, driven by what a route actually uses:

```tsx
<NextIntlClientProvider messages={pick(messages, ["shell", "prReview", ...])}>
```

Cheapest correct first move: pick the **seven used namespaces** at the root and
leave the loader alone. That is a one-line change, removes the 11 dead
namespaces immediately, and does not need per-route plumbing.

Per-route narrowing is the better end state but needs the provider pushed below
`layout.tsx`, which is a bigger move — do it when a route's copy actually grows.

**Do not delete the unused JSON files.** They are the design reference for
lesson features (see the repo-wide insight on building L01–L08 from the
artboards, not from git history). Excluding them from the payload is the fix;
removing them destroys course material.

### 3. Copy and the confirm dialog

- Add the five strings above to `messages/en/prReview.json` and
  `messages/en/shell.json` (breadcrumb), nested camelCase.
- Wire `AddRepoView` to the existing, currently-unused
  `messages/en/onboarding.json`.
- Replace `window.confirm` with a confirmation modal in the
  `CreateAgentModal` shape, colocated under the component that owns the delete.
  That also makes the delete path testable, which is the real win.

While in `pulls/[number]/page.tsx`, two one-liners:

- `line 72` — `React.useMemo(() => runs.flatMap(...), [reviews])` reads `runs`
  and declares `[reviews]`. Equivalent today; fix the array. (Spec
  [`04-enforcement-lane`](../../../.context/specs/04-enforcement-lane.md) makes
  this class fail the build.)
- the page has **no `styles.ts`** — its inline `style={{ padding: "28px 32px" }}` objects (`line 101`,
  `line 129`) belong in one at the route rung, per
  `frontend-architecture` § Styling.

## Ordering

1 and 2 are independent and can land separately. 3 is best done *after* 1,
because moving the skeletons into `loading.tsx` rewrites the same lines the
copy changes touch.

## Verification

```sh
cd client && pnpm typecheck && pnpm test
```

Plus a browser check that the error boundary actually catches — throw in a page
body temporarily and confirm `error.tsx` renders instead of a blank document.
The e2e flows (`e2e/specs/`) cover the happy paths and will not see this.

## Non-goals

- **Not converting pages to Server Components.** `"use client"` sitting at the
  route instead of the leaves is listed as accepted debt in
  `frontend-architecture` § Known exceptions. `loading.tsx` and `error.tsx`
  work regardless of that, so the two changes are independent — do not bundle
  them.
- **No second locale.** Single locale, no routing, unchanged.
- **Not deleting the unused message files.**
- **No change to `i18n/request.ts`'s directory-reading design.**
