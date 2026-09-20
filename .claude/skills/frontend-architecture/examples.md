# frontend-architecture — worked examples

Every pair below is real code from `client/src`, not invented. The "good"
column is the shape to copy; the "bad" column is either existing accepted debt
(marked **debt**) or a plausible mistake.

---

## 1. A route entry

### Good — `app/agents/page.tsx`

```tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

Six lines, no `"use client"`, no hooks, no data. The page is a shell; the view
below it owns the interactivity and carries the directive. This is the target
shape for every route.

### Bad (**debt**) — `app/repos/[repoId]/pulls/[number]/page.tsx`

```tsx
"use client";
// …
import { AppShell } from "../../../../../components/app-shell";
import { usePullDetail, usePulls } from "../../../../../lib/hooks";
import { usePrReviews, useCancelRun, usePrActiveRuns } from "../../../../../lib/hooks/reviews";
```

Three problems in the import block alone: the whole route is a Client Component
because the page is, the paths climb five levels instead of using `@/`, and one
import goes through the aggregating `lib/hooks` barrel while the next reaches
the module directly. Leave it until you are working on this route.

---

## 2. Constants and helpers at rung 0

### Good — `_components/FindingsPanel/constants.ts`

```ts
/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
```

Named, doc-commented, and scoped to the one component that uses them. Neither
value appears as a literal in the JSX.

### Good — `_components/FindingsPanel/helpers.ts`

```ts
import { FILTERABLE_SEVERITIES, LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Keep the selected severity (null = all), optionally drop low-confidence,
 *  sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: string | null,
): FindingRecord[] {
  let shown = severity ? findings.filter((f) => f.severity === severity) : findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
```

No React import, no hooks, one direction of dependency (`helpers` → `constants`,
never back). That is what makes `helpers.test.ts` possible without rendering
anything.

### Bad — the same logic inlined

```tsx
const shown = findings
  .filter((f) => !severity || f.severity === severity)
  .filter((f) => !hideLow || f.confidence >= 0.65)   // magic number in JSX
  .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
```

Now the threshold is a literal, the rule cannot be tested without mounting the
component, and the next component that needs the same filter copies it.

---

## 3. Deriving instead of storing

### Good — `_components/FindingsPanel/FindingsPanel.tsx:33`

```tsx
const counts = React.useMemo(() => countBySeverity(findings), [findings]);
const severities = presentSeverities(counts);
// A refetch can drop the last finding of the selected level; fall back to all.
const sevFilter = selected && counts[selected] ? selected : null;
const shown = React.useMemo(
  () => visibleFindings(findings, hideLow, sevFilter),
  [findings, hideLow, sevFilter],
);
```

Only `selected`, `hideLow` and `focusIdx` are state — the three things a user
actually changes. Counts, the visible severities, the effective filter and the
final list are all computed in render from those three plus props.

### Bad — mirroring props into state

```tsx
const [shown, setShown] = React.useState(findings);
React.useEffect(() => {
  setShown(visibleFindings(findings, hideLow, selected));
}, [findings, hideLow, selected]);
```

One extra render per change, and a window where `shown` disagrees with
`findings`. The rule is in `react-best-practices`; the reason it belongs here
too is that it decides whether `helpers.ts` exists at all.

---

## 4. A data hook

### Good — `lib/hooks/reviews.ts`

```ts
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}
```

The key holds exactly the variable the query function uses. The key and the
function sit together, in the domain file, not in a global key registry. The
hook earns its existence: the polling policy is the thing being named.

### Bad — fetching from the component

```tsx
const [runs, setRuns] = React.useState<RunSummary[]>([]);
React.useEffect(() => {
  fetch(`${API_BASE}/pulls/${prId}/runs`).then((r) => r.json()).then(setRuns);
}, [prId]);
```

Skips `lib/api.ts`, so failures never become `ApiError` and the error UX has
nothing to branch on. No dedupe, no cache, no polling, and a second component
rendering the same data fetches it again.

---

## 5. Types

### Good — anywhere in `client/src`

```ts
import type { FindingRecord, RunSummary } from "@devdigest/shared";
```

### Bad — a local restatement

```ts
interface Finding {
  id: string;
  severity: string;      // the contract has a union
  start_line: number;
  confidence: number;
}
```

The shape now exists twice and drifts silently the first time the server adds a
field. Contracts are vendored *twice already* (`client/src/vendor/shared` and
`server/src/vendor/shared`); a third copy inside a component is how the drift
becomes invisible.

---

## 6. Barrels

### Good — `_components/FindingsPanel/index.ts`

```ts
export { FindingsPanel, FindingsPanel as default } from "./FindingsPanel";
```

One line, one module, explicit names. Keeps the import `./_components/FindingsPanel`
instead of `./_components/FindingsPanel/FindingsPanel`.

### Bad — the App Router build error

```ts
export * from "./FindingsPanel";
export { default } from "./FindingsPanel";
```

Fails the build with `the name 'default' is exported multiple times`. No file in
the repo does this today; the risk is someone "simplifying" the good form into
it.

### Bad (**debt**) — `lib/hooks/index.ts`

```ts
export * from "./core";
export * from "./agents";
export * from "./reviews";
export * from "./trace";
export * from "./repo-intel";
```

Importing one hook through this pulls all five modules in synchronously, and it
is the shape that produces `module → index → module` cycles. It stays for
existing callers; new code imports `@/lib/hooks/reviews`.

---

## 7. The client boundary

### Good — `app/layout.tsx`

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} …>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <Providers>{children}</Providers>
```

An `async` Server Component that *renders* client providers without becoming a
Client Component itself. `children` arrives as already-rendered elements, so a
server subtree can sit inside `<Providers>` without entering the client graph.

### Bad — hoisting the directive to the top

```tsx
"use client";
export default function RootLayout({ children }) { … }
```

Every module imported from the layout is now in the client graph, including
ones that never needed to be. The directive marks the *entry* to a client
subtree; put it on the interactive leaf instead.

### Bad — a compound component across the seam

```tsx
// Server Component
import { Menu } from "@devdigest/ui";
<Menu><Menu.Item /></Menu>   // Menu.Item is undefined → "Element type is invalid"
```

A Server Component importing a Client Component receives a client reference,
not the function, so static properties are gone. Export `Menu` and `MenuItem`
as separate named exports instead.
