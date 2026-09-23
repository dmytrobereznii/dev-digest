# 08 — Smart Diff

**Lesson:** L03 (Smart Diff; the Intent Layer is spec 07) | **Scope:** repo-wide (reviewer-core, server, client, both `vendor/shared` copies, seed, e2e)
**Status:** ready
**Goal:** The Files changed tab stops showing files in GitHub order. It groups
them by role (core → tests → wiring → docs → boilerplate), so a lock file no
longer sits next to business logic. It also carries the latest review into the
diff: a dot and count per group, a dot per file, and under the cited line a
colored bar, a severity pill and the same `FindingCard` the Agent runs tab
uses, with Accept/Reject. An "Original order" toggle restores GitHub order. A
pure path classifier does the grouping, and `GET /pulls/:id/smart-diff` serves
it. No model is called, and grouping works before any review exists. The Agent
runs tab does not change.

Built from the artboards and the live code only. Removed implementations in git
history are off-limits (root INSIGHTS, 2026-09-16).

## Design reference

Bundle `designs_with_skills.html`, extracted 2026-09-20, artboard `pr-files`
(`canvas/canvas.jsx:48`). The component grep
(`SmartDiff|DiffFileCard|SplitBanner`) hits 2 files. The feature grep
(`smart|reviewer-ordered|role|boilerplate|wiring`, case-insensitive) hits 6.
Three of those are unrelated: `data2.jsx` (`service_role`),
`screen_dashboard.jsx:15` ("caller's role") and `primitives.jsx:180`
(`role: "switch"`). That leaves **3 surfaces and 1 fixture**:

| Surface | What it contributes |
|---|---|
| `src/diff.jsx:3-7` → `ROLE` | label, colour and description per role: core `--accent` "Core logic · The substance of the change — review closely"; wiring `--warn` "Hooks the core into the app"; boilerplate `--text-muted` "Generated / mechanical — skim" |
| `src/diff.jsx:9-22` → `CodeLine` | finding line: absolute 3px left bar in `SEV[sev].c`; right label with `SEV` icon (11) and text `blocker` for CRITICAL, otherwise the lowercased severity, at 10.5px/600 |
| `src/diff.jsx:24-46` → `DiffFileCard` | a 6×6 `var(--crit)` dot right after the path when the file has findings; opens by default when it has findings; `+/−` stat on the right; boilerplate body "Mechanical changes — diff collapsed by default" |
| `src/diff.jsx:64-91` → `SmartDiff` | stats row "9 files · +247 −38"; a segmented **Smart order / Original order** toggle (container `--bg-surface`, 1px border, radius 7, pad 2; active button `--bg-elevated` / `--text-primary`, 11.5px/600); group header: 8×8 radius-2 square in the role colour, label 12.5/700, description 11.5 muted, "N files" on the right; `sticky` |
| `src/screen_pr_detail.jsx:142-146` → `FilesTab` | `SectionLabel icon="Code"` "Reviewer-ordered diff" above `SmartDiff` |
| `src/findings.jsx:41-76` → `FindingCard` | the inline comment's content: severity, title, category, `file:line` and confidence, rationale, SUGGESTED FIX, Accept/Dismiss |
| `src/data.jsx:125-150` → `DIFF` (fixture) | the `SmartDiff` contract shape. Its grouping is **illustrative, not a spec**: it puts `src/api/users.ts` and `test/ratelimit.test.ts` under boilerplate |

**The user's screenshots (4–7) are a newer iteration than the extracted
bundle.** They add a chevron that collapses each group, "● N" in `--crit` before
"N files", the inline finding card inside the diff, and a bordered severity
pill. Where the screenshots and `diff.jsx` differ, the screenshots win (D9, D10).
The design has only three roles, so `tests` and `docs` get their styling in D12.
`SplitBanner` (`diff.jsx:48-62`) and `pseudocode_summary` are out of scope.

---

## 1. What already ships

| Layer | Fact | Where |
|---|---|---|
| Contract | `SmartDiffRole = z.enum(['core','wiring','boilerplate'])`; `SmartDiffFile {path, pseudocode_summary?, additions, deletions, finding_lines[]}`; `SmartDiff {groups, split_suggestion}`. Identical in both copies, and **used nowhere** | `server/src/vendor/shared/contracts/brief.ts:126-159` |
| Contract | `SmartDiffResponse = SmartDiff`, an alias used nowhere | `contracts/review-api.ts:98-100` (both copies) |
| Contract | `Severity` has 3 values; `Finding` carries `start_line`/`end_line`, not `line`; `PrFile.patch` is `nullish` | `contracts/findings.ts:11,55-70`; `contracts/platform.ts:192-198` |
| Drift | `diff -r` lists 5 files: `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. `brief.ts` and `review-api.ts` are identical | run 2026-09-23 |
| Engine | reviewer-core has **no** path classifier. Its runtime deps are `openai` + `zod` only, so there is no glob library | `reviewer-core/package.json`, `reviewer-core/CLAUDE.md` |
| Server | `GET /pulls/:id` **deletes and re-inserts** `pr_files` on its live path (no transaction). The offline path selects them **with no ORDER BY**. `pr_files` has no position column | `modules/pulls/routes.ts:235-246,274`; `db/schema/pulls.ts:36-45` |
| Server | `GET /pulls/:id/reviews` returns reviews newest-first, each with every finding (dismissed included) | `modules/reviews/routes.ts:167-174`, `repository/review.repo.ts:58-78` |
| Server | "Latest review" means the newest `kind='review'`, with dismissed findings excluded, on the PR list | `server/.context/docs/pr-list-read-model.md`; client twin `pulls/_components/FindingsCell/helpers.ts:11-17` |
| Server | A module reads its own copies of PR rows (`getPull`, workspace-scoped) rather than a sibling's | `modules/intent/repository.ts:36-55` |
| Server | The registry comment already anticipates an `intent/smart-diff` module | `modules/index.ts:24,27-39` |
| Mocks | `MockLLMProvider.calls` records every call | `adapters/mocks.ts:65-67` |
| Client | `DiffTab` renders one `DiffViewer` and has hardcoded English ("Files changed · N files", "Show/Hide comments", the post-failure toast) | `pulls/[number]/_components/DiffTab/DiffTab.tsx:37,55,60` |
| Client | `DiffViewer` lives on rung 2 (`src/components/diff-viewer`) and uses the `shell` i18n namespace. `DiffTab` is its only consumer | `components/diff-viewer/DiffViewer/DiffViewer.tsx:14-32` |
| Client | `FileCard` opens when `additions+deletions ≤ AUTO_EXPAND_MAX_LINES` (200) and shows a `MessageSquare` + count after the stat. `filePath` style is `flex: 1` | `FileCard/FileCard.tsx:35-37,67-74`; `constants.ts:4`; `styles.ts:22-30` |
| Client | `parsePatch` → `{kind, oldNo, newNo}`; `keysForLine` → `RIGHT:<new>`/`LEFT:<old>`; `partitionThreads` splits matched from outdated; thread rail `margin: 6px 14px 8px 58px` | `helpers.ts:12-38`; `comments.ts:63-74,89-106,133-138` |
| Client | `CodeLine` renders threads under a line only when `showComments`, and comments **start hidden** | `CodeLine/CodeLine.tsx:67-71`; `DiffTab.tsx:22` |
| Client | `OutdatedComments` is the footer for threads that cannot be placed on a line | `OutdatedComments/OutdatedComments.tsx:10-19` |
| Client | `FindingCard` sits on the **route rung** (sibling of `DiffTab`): compact `SeverityBadge`, title, `CategoryTag`, `MonoLink file:line`, `ConfidenceNum`, a chevron collapse, Markdown rationale/suggestion, Accept/Reject | `pulls/[number]/_components/FindingCard/FindingCard.tsx:26-117` |
| Client | Actions are wired as `useFindingAction().mutate({findingId, action, prId})` | `FindingsPanel/FindingsPanel.tsx:27,106-109` |
| Client | `usePrReviews` key `["reviews", prId]`. `useRunReview`, `useFindingAction`, `useDeleteRun` and `useDeleteReview` invalidate it | `lib/hooks/reviews.ts:54-60,63-74,84-90,127-139,143-165` |
| Client | The page refetches reviews in `onRunDone`, which fires from the Agent runs tab | `pulls/[number]/page.tsx:155-162,166-173` |
| Client | `PrDetailHeader` is `sticky; top: 0; zIndex: 5`, height not fixed | `PrDetailHeader/styles.ts:5-7` |
| Kit | `SEV` (colour, bg, icon, label per severity) lives in **`primitives/tokens.ts`**, not `Badge.tsx`; `SeverityBadge` at `Badge.tsx:52` | `client/src/vendor/ui/primitives/tokens.ts:6-14` |
| i18n | `prReview.smartDiff` has `coreLabel: "Core"`, `wiringLabel`, `boilerplateLabel`, `filesCount`, `findingLines`, `groupedByRole`, `largeTitle/Body`. **No code reads any of them.** `finding.dismiss` is **"Reject"** | `client/messages/en/prReview.json:7,59-67` |
| Seed | #482 has 4 files (`ratelimit.ts`, `webhooks.ts`, `config.ts`, `users.ts`) and a review with CRITICAL `src/config.ts:12` and WARNING `src/api/users.ts:45-52` | `server/src/db/seed.ts:33-38,190-214` |
| Seed | Other fixtures ship **unreviewed**. None has a lock file or a docs file | `db/seed-prs/index.ts:17-20,42` |
| Seed | `seed-fixtures.test.ts` checks hunk headers, totals and that each seeded finding intersects a hunk | `server/test/seed-fixtures.test.ts:103-159` |
| e2e | Flow 05 waits for the text `src/config.ts` on #482's diff. The seed contract says "Only #482 has a review" | `e2e/specs/05-pr-diff.flow.json:13`; `e2e/.context/docs/seed-contract.md:17,39-41` |

### Mismatches with the brief
- `SEV` lives in `primitives/tokens.ts`, not `Badge.tsx`.
- The dismiss button reads "Reject", not "Dismiss".
- `PrFile.patch` is `nullish`.
- The diff viewer's copy lives in `shell`, not `prReview`.
- On a PR reviewed by several agents, "the latest review" is one agent's review
  (Q1).
- `FindingCard` cannot be imported by the rung-2 diff viewer (D7).

### What is actually missing
A classifier. The `tests`/`docs` roles. A route. Anything that renders groups,
file dots, line markers or inline findings. A PR fixture that covers every role.

---

## 2. Decisions

### D1 — Classifier in reviewer-core; the route in a new server module
`reviewer-core/src/smart-diff/` holds `constants.ts` (the rules, `ROLE_ORDER`)
and `classify.ts` (`normalizePath(p)`, `classifyFile(p): SmartDiffRole`). It is
pure and path-only, and `src/index.ts` exports it. The server's new
`modules/smart-diff/` does the I/O and assembles the response.
**Why:** `onion-architecture` "Where does this code go?" step 3 puts pure
review-adjacent computation in reviewer-core. The pre-prompt filter L08 wants
runs where the prompt is assembled. The server and the CI runner can import
reviewer-core, but reviewer-core cannot import the server.
**Rejected:**
- `server/modules/reviews/smart-diff/`: the engine could not reach it.
- `vendor/shared`: that is logic in ring 1, with two copies to keep in sync.
- A glob library: a new engine runtime dependency. Rules are anchored RegExps
  instead.

### D2 — Rules (first match wins, in this order), on a normalized POSIX path
`normalizePath` converts `\` → `/` and strips a leading `./`. Name patterns
compare against the basename.

| # | Role | Matches |
|---|---|---|
| 1 | boilerplate | `*.lock` (yarn, Cargo, poetry, Gemfile, composer), `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `bun.lockb`; `(^|/)(dist|build)/`; `(^|/)__snapshots__/`, `*.snap`; `*.generated.*`; `*.min.js`, `*.min.css`; `(^|/)migrations/meta/` (drizzle journal and snapshots) |
| 2 | tests | `*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}` (covers `.it.test.ts`); `(^|/)(test|tests|__tests__|e2e)/` |
| 3 | wiring | barrels `index.{ts,js,mjs,cjs}` (not `.tsx`); `*.config.*`; `config.{ts,js,mjs,cjs}`; `package.json`; `tsconfig*.json`; `.eslintrc*`; `.env*`; `docker-compose*.y{a,}ml`; `Dockerfile*`; `Makefile`; `.gitignore`, `.npmrc`, `.nvmrc`, `.prettierrc*`, `.editorconfig`; `^\.github/`, `^\.claude/` |
| 4 | docs | `*.{md,mdx,rst,adoc}`; `(^|/)docs/`; `README*`, `CHANGELOG*`, `LICENSE*`, `CONTRIBUTING*` (case-insensitive) |
| 5 | core | everything else |

**Where this departs from the brief:**
- `config.ts` → wiring, because the design files `src/config.ts` under Wiring.
- `package.json` → wiring, not the fixture's boilerplate. A new dependency must
  not hide in a collapsed group.
- Extra lock-file names, `.min.css`, `migrations/meta/`, `.mdx/.rst/.adoc`.
- `dist/` and `build/` match at any depth. `index.tsx` is core, because in this
  repo it is a component.

Required cases: `__tests__/__snapshots__/x.snap` → boilerplate;
`.claude/skills/security/SKILL.md` → wiring. `e2e/README.md` → **tests, kept on
purpose**: a README inside a test tree ships with the tests. The test row says
so in a comment.

### D3 — Five roles; the enum order is the display order; the server always returns all five groups
`SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])` in both
copies. `ROLE_ORDER` in reviewer-core `constants.ts` is typed
`readonly SmartDiffRole[]`, and T1 asserts it equals `SmartDiffRole.options`.
The route always returns the five groups in that order, and empty ones carry
`files: []`. **The client hides empty groups** (a "Docs · 0 files" header is
noise). Within a group, files keep `pr_files` order.

### D4 — Findings come from the latest review, undismissed, and are anchored on `start_line`
The route picks the newest `reviews` row with `kind='review'` for the PR. This
is the PR-list rule, and every count surface in `findings-surfaces.md` already
applies it. `finding_lines` per file holds the sorted, deduplicated
`start_line`s of that review's findings where `file === path` and
`dismissed_at IS NULL`. `SmartDiffResponse` becomes
`SmartDiff.extend({ review_id: z.string().nullable() })`. The client renders
cards from **exactly** that review, so dots and cards never come from two
different reviews. `null` means no review yet.
**Rejected:** a union of all reviews (re-runs would show stale duplicates);
the latest review per agent (it would diverge from every other surface; Q1).

### D5 — `/smart-diff` sets the structure, `pr.files` supplies the patch, `usePrReviews` supplies the card text
The client joins by path. A `PrFile` whose path is missing from the response
lands in **core** and is never dropped. That covers the window while
`GET /pulls/:id` deletes and re-inserts. The route is the only thing that
classifies.
**Rejected:**
- Classifying on the client: a second classifier, or pulling reviewer-core into
  the Next bundle.
- Adding `patch` to `SmartDiffFile`: it would send the largest payload twice.

### D6 — Collapse defaults
Groups: core, tests and wiring start open; docs and boilerplate start
collapsed, and their file cards are not rendered until the group is expanded.
File cards: open when the file **has findings** (design `diff.jsx:25`), or when
its role is not boilerplate and it has `≤ AUTO_EXPAND_MAX_LINES` changed lines.
Boilerplate cards start closed (design: "Mechanical changes — collapsed").
Initial state is computed on mount. The view mounts only after `/smart-diff`
resolves, so `finding_lines` are known by then.

### D7 — The diff viewer gets a generic annotation seam, not a findings import
`components/diff-viewer/annotations.ts`:
- `LineMarker {color, label, icon: IconName}`
- `LineAnnotation {id, keys: string[] /* ordered lineKey('RIGHT', n) range */, marker: LineMarker | null, node: ReactNode}`
- `partitionAnnotations(items, renderedKeys) → {matched: Map<key, LineAnnotation[]>, unanchored}`,
  which mirrors `partitionThreads`. **Updated 2026-09-23 (Fix 1):** `key`
  widened to an ordered `keys` range so one annotation can cover
  `start_line..end_line` — the marker is copied onto every rendered key, the
  `node` kept on only the last rendered one, and a range with no rendered key
  goes to `unanchored` exactly once.

`FileCard` gains `annotations?`, `flagged?` and `startClosed?`. `CodeLine` gains
`annotations`. A new `UnanchoredAnnotations` component renders annotations at
the file's end under the `shell` title "Outside the diff" (the shape of
`OutdatedComments`). `DiffViewer` gains `annotations?: Map<path, LineAnnotation[]>`,
`flaggedPaths?: Set<string>` and `startClosed?: boolean`.
**Why:** rung 2 cannot import the route-rung `FindingCard`, and rendered
elements count as data (`frontend-architecture`).
**Rejected:** promoting `FindingCard` to `src/components` (one route uses it); a
`renderLine` callback.

### D8 — The inline card is the existing `FindingCard`, unmodified
It renders `defaultExpanded`, inside the thread rail (`cs.thread` margins).
Accept and Reject go through `useFindingAction`. Consequences, all accepted:
- The labels read Accept/**Reject** (`prReview.finding.*`), not the screenshot's
  Dismiss.
- The severity badge is compact.
- A chevron replaces the screenshot's ✕. Collapsing gives the one-line card for
  free (P3).

**Why:** the Agent runs tab stays byte-for-byte unchanged, and there is one card
component. **Rejected:** a slim copy (two cards drift apart).

### D9 — Line marker
**Updated 2026-09-23 (Fix 1):** on every **rendered** line of
`start_line..end_line`, not only `start_line` — a multi-line finding needs its
own anchor on each line it actually touches, not just its first. The card
itself still renders **once, after the range's last rendered line**
(GitHub-style), not once per marked line and not wedged after `start_line` —
one finding is one card, and it reads after the code it discusses. A finding
whose whole range misses every rendered line still lands in "Outside the
diff", exactly once, unchanged (D7/A13). Dismissed findings get no marker;
their card is muted by `FindingCard` itself.
- A 3px bar, absolute at `left: 0`, in `SEV[sev].c`.
- A right-aligned pill: `SEV` icon (11) + label, 10.5px/600, `color` and
  `1px solid` border in `SEV.c`, background `SEV.bg`, radius 5, padding `1px 6px`.
  Screenshot 6 wins over the plain label in `diff.jsx:20`.
- Labels are i18n: CRITICAL → "blocker", WARNING → "warning",
  SUGGESTION → "suggestion".
- When several findings share a line, the highest severity sets the marker and
  every card renders.

No new palette.

### D10 — Dots
- **File:** a 6×6 `var(--crit)` dot directly after the path (`diff.jsx:33`),
  with an i18n `title`. `filePath` drops `flex: 1` in favour of
  `flex: 0 1 auto` so it still ellipsizes, and the `+/−` stat takes
  `marginLeft: auto`. The existing comment counter keeps its icon and its
  place.
- **Group:** "● N" in `var(--crit)`, 11px/600 tnum, placed before "N files",
  where N = files in the group with `finding_lines.length > 0`. Hidden when
  N is 0.
- The colour is always `--crit`, as designed. The route does not carry severity.

### D11 — Header, toggle and states
- `SectionLabel icon="Code"` "Reviewer-ordered diff". The show/hide comments
  button stays in its `right` slot.
- Under it, the stats row "N files · +A −D" (summed from `pr.files`) and a
  local `OrderToggle` segmented control on the right. The kit has none, so the
  tokens come from `diff.jsx:72-77`. Buttons carry `aria-pressed`.
- The toggle state is `useState('smart')`. It is not in the URL, as in the
  design.
- **Findings do not follow the comments toggle.** Comments start hidden, which
  would hide findings on load and fail A11.
- No review → one muted line "No review yet — run one to see findings inline",
  and no counts at all.
- Loading → `Skeleton` rows.
- Route error → the flat original order, a muted "Grouping unavailable" note,
  and the Smart button disabled.
- **Original order** = one flat `DiffViewer` over every file **sorted by path**
  (`path.localeCompare`), not `pr.files`'s own order, with the same
  annotations and flags. **Updated 2026-09-23 (Fix 2):** the design's
  `SmartDiff` flat branch sorts by path (`diff.jsx:90`); `pr.files` order is
  GitHub's own and would leak through instead of matching it.

### D12 — `tests` and `docs` styling, where the design is silent
- tests: `var(--ok)`, "Tests", "Proves the change — check what it asserts".
- docs: `var(--info)`, "Docs", "Prose and reference — skim for accuracy".
- `coreLabel` becomes "Core logic", as in the design. It is safe to change
  because nothing reads it.

### D13 — Freshness without polling
The client hook `useSmartDiff(prId)` lives in `lib/hooks/reviews.ts`. Its key is
`["smart-diff", prId]`, and it is parsed with `SmartDiffResponse`. It is
invalidated at every point that invalidates `["reviews", prId]`:
`useRunReview`, `useFindingAction`, `useDeleteRun`, `useDeleteReview`, and the
page's `onRunDone`. Keeping them in the same file keeps the key and all its
invalidations in one place.

### D14 — Minimal `split_suggestion`, no summaries
`{too_big: false, total_lines: Σ(additions+deletions), proposed_splits: []}`.
`pseudocode_summary` is omitted. The client never renders `SplitBanner`.

### D15 — Test data: a seeded, reviewed fixture #499, plus a manual real-PR recipe
e2e has no LLM, so a deterministic reviewed PR must be seeded. That is the
index's own exception: "a state a real run cannot produce on demand". §6.

---

## 3. Contracts — both `vendor/shared` copies (step 1)

Edit `client/src/vendor/shared/` **and** `server/src/vendor/shared/` identically:
- `contracts/brief.ts`: `SmartDiffRole` gets its 5 values (D3), with a comment
  that the order is the display order.
- `contracts/review-api.ts`: `SmartDiffResponse = SmartDiff.extend({ review_id: z.string().nullable() })`.

Afterwards `diff -r` lists only the five baseline files.

## 4. reviewer-core — classifier (step 2)

- `src/smart-diff/constants.ts`: `ROLE_RULES`, an ordered
  `{role, patterns: RegExp[]}[]` (D2) with a one-line comment per pattern, and
  `ROLE_ORDER` (D3).
- `src/smart-diff/classify.ts`: `normalizePath`, `classifyFile`.
- `src/smart-diff/classify.test.ts`: T1, written first.
- `src/index.ts`: export `classifyFile`, `normalizePath`, `ROLE_ORDER`.

## 5. Server — `modules/smart-diff/` (step 3)

Use the `onion-architecture` checklist, with `modules/agents/` as the reference.
- `repository.ts`: `getPull(ws, prId)` (workspace-scoped, following
  `intent/repository.ts:38`); `getPrFiles(prId)`;
  `latestReviewFindings(prId) → { reviewId: string | null, findings: {file, startLine, dismissed: boolean}[] }`,
  meaning the newest `kind='review'` row and its findings. The repository maps
  rows to plain shapes.
- `helpers.ts` (pure): `buildSmartDiff(files, latest, classify) → SmartDiffResponse`
  implements D3, D4 and D14. `classify` is injected so the unit test does not
  depend on the rule table.
- `service.ts`: `SmartDiffService(repo)`, `get(ws, prId)`. It throws
  `NotFoundError` when the pull is missing and passes `classifyFile` from
  `@devdigest/reviewer-core`.
- `routes.ts`: `GET /pulls/:id/smart-diff`,
  `{ params: IdParams, response: { 200: SmartDiffResponse, ...ApiErrors, ...NotFound } }`.
  One service call. The response schema makes the contract enforced (root
  INSIGHTS, 2026-09-20).
- Register `smartDiff` in `modules/index.ts`. No container getter is needed,
  because no other module calls it.
- `make lint-arch` stays at 0 errors.

## 6. Seed — fixture #499 (step 4)

`server/src/db/seed-prs/499-<slug>.ts`, added to `DEMO_PRS`, on
`acme/payments-api`. Its title is unique, `ghStatus: 'open'` and
`lastReviewedSha: null` (so it shows under the default list filter). Files,
all with patches, one per role or more:

| Role | File |
|---|---|
| core | `src/lib/retry-window.ts` (new), `src/api/payouts/retry.ts` (modified) |
| tests | `test/lib/retry-window.test.ts` |
| wiring | `src/lib/index.ts` (barrel), `package.json` |
| docs | `docs/retry-window.md` |
| boilerplate | `pnpm-lock.yaml` (~10-line hunk) |

The `review` block (General Reviewer, `request_changes`) holds:
- one **CRITICAL** in `retry-window.ts`
- one **WARNING** in `retry.ts`
- one **SUGGESTION** in the test file

Each `startLine` must be a rendered new-side line, not just a line that
intersects a hunk. Finding titles must not collide with the seed-contract
table. Validate with `seed-fixtures.test.ts` (server INSIGHTS, 2026-09-20/21),
and do not hand-count hunk headers.

Also update:
- `seed-prs/index.ts`: the header comment explains why #499 carries a review.
- `e2e/.context/docs/seed-contract.md`: #499 values, and "Only #482" becomes
  "#482 and #499".
- `client/.context/docs/findings-surfaces.md`: add the Smart Diff row (latest
  review, dismissed not counted, cards show dismissed muted).

**Manual real PR** (for the user's fork; not run by agents). Branch off `main`:
1. `cd client && pnpm add -D <tiny package>`. This changes `package.json` and
   `client/pnpm-lock.yaml`. Use `client`, not `server`, because of the
   `ERR_PNPM_UNEXPECTED_STORE` entry in the server INSIGHTS.
2. Make a small logic change in `client/src/lib/…`, with its `*.test.ts`.
3. Touch a barrel `index.ts`.
4. Add one README line.

Import the PR, run a review, and confirm A7–A15 by eye.

## 7. Client (steps 5–6)

**Step 5: the diff-viewer seam (D7, D9, D10)**, in `src/components/diff-viewer/`:
- new `annotations.ts` and `annotations.test.ts`
- `FileCard` (dot, `startClosed`, annotations, unanchored block)
- `CodeLine` (bar, pill, nodes below)
- new `UnanchoredAnnotations/`
- `DiffViewer` (new props, passed through)
- `index.ts` exports the annotation types
- `styles.ts` (`filePath`, dot, bar, pill)
- `shell.json` `diffViewer`: merge in `outsideDiffTitle` and `hasFindings`

With none of the new props, today's rendering is unchanged.

**Step 6: the Smart Diff view** in `pulls/[number]/_components/DiffTab/`:
- `DiffTab.tsx` composes the D11 header and toggle, then either `RoleGroup`s or
  the flat viewer. It also uses `useSmartDiff`, `usePrReviews` and
  `useFindingAction`, and moves its hardcoded strings to i18n.
- `helpers.ts`:
  - `getViewGroups(files, sd)` implements D3 and D5.
  - `getFindingAnnotations(review, t, render)` implements D4 and D9.
  - `getMarker(sev)` returns the marker for a severity.
- `constants.ts`: `ROLE_UI` (colour, label key, description key, `groupOpen`,
  `filesStartClosed`) and `SEVERITY_RANK`.
- `styles.ts`; `helpers.test.ts`; `DiffTab.test.tsx`.
- Nested components: `_components/RoleGroup/` (collapsible header plus
  `DiffViewer` over the group's files) and `_components/OrderToggle/`.
- Import with `@/`; `FindingCard` comes from the sibling `../FindingCard`.

Also in step 6:
- `lib/hooks/reviews.ts`: `useSmartDiff`, plus the D13 invalidations.
- `page.tsx`: `onRunDone` also invalidates `["smart-diff", prId]`, and passes
  `pr` fields to `DiffTab` as before. `useSmartDiff` value-imports a schema, so
  open the page in a browser (client INSIGHTS, 2026-09-20).
- i18n: **merge** into `prReview.json` → `smartDiff`, keeping every existing
  key. Grep `t("prReview.` and `smartDiff.` first (client INSIGHTS,
  2026-09-21). New keys:
  - `title`, `stats`, `smartOrder`, `originalOrder`
  - `testsLabel`, `docsLabel`, `desc.{core,tests,wiring,docs,boilerplate}`
  - `marker.{critical,warning,suggestion}`, `filesWithFindings`
  - `noReview`, `unavailable`, `showComments`, `hideComments`, `postFailed`

  `coreLabel` changes to "Core logic". `prReview` is already in
  `USED_NAMESPACES`.

## 8. Tests

| ID | Suite | Covers |
|---|---|---|
| T1 | reviewer-core `src/smart-diff/classify.test.ts` | Path→role table: the 3 required cases (the `e2e/README.md` row carries the D2 comment); every lock name; `dist/`/`build/` at depth; `.snap`; `*.it.test.ts`, `*.spec.ts`, `__tests__/`; barrel `index.ts` vs `index.tsx` → core; `vite.config.ts`, `src/config.ts`, `tsconfig.base.json`, `.env.example`, `.github/workflows/x.yml`, `package.json`; `docs/a.ts` → docs; `README` case-insensitivity; false positives `src/latest/x.ts`, `src/testing.ts` → core; `src\\a.test.ts` → tests; `ROLE_ORDER` equals `SmartDiffRole.options` |
| T2 | server unit `modules/smart-diff/helpers.test.ts` | 5 groups in fixed order including empty ones; within-group order kept; `finding_lines` sorted and deduplicated, dismissed excluded, other-file findings ignored; `total_lines`; no review → `review_id: null` and every list `[]` |
| T3 | server integration `test/smart-diff.it.test.ts` | Seeded #482 and #499 through `app.inject`: body parses with `SmartDiffResponse`; roles as A2/A4; `review_id` = newest review; dismiss → line gone, accept → kept; unreviewed #479 → `review_id: null`; `MockLLMProvider.calls` empty; 404 on an unknown uuid, 422 on a non-uuid |
| T4 | server unit `test/seed-fixtures.test.ts` (unchanged) | #499 hunks, totals and finding anchors |
| T5 | client `components/diff-viewer/annotations.test.ts` + `FileCard/FileCard.test.tsx` | matched vs unanchored; bar and pill on the keyed row; node under it; "Outside the diff" block; dot only when `flagged`; `startClosed`; no new props → today's output |
| T6 | client `DiffTab/helpers.test.ts` | `getViewGroups` (order, empty dropped, unknown path → core, `pr.files` order kept); `getMarker` precedence; dismissed → no marker |
| T7 | client `DiffTab/DiffTab.test.tsx` (fetch mocked) | headers in order with "● N" and "N files"; docs/boilerplate collapsed, so the lock file is absent until expanded; the finding card under its line; Reject POSTs `/findings/:id/dismiss`; Original order is flat, sorted by path (Fix 2); no-review hint; a multi-line finding marks every rendered line of its range and its card sits once after the last rendered line (Fix 1) |
| T8 | e2e `e2e/specs/11-smart-diff.flow.json` | #499 → Files changed: `REVIEWER-ORDERED DIFF`; `Core logic`, `Tests`, `Wiring`, `Docs`, `Boilerplate`; the CRITICAL finding's title; click `Original order` → `pnpm-lock.yaml` appears. Uses `--text`/`find` only. Flow 05 still passes (`src/config.ts` sits in the open Wiring group) |

## 9. Out of scope

- The Agent runs tab: any change to `FindingCard`, `FindingsPanel` or
  `ReviewRunAccordion`.
- `SplitBanner`, a real `split_suggestion`, `pseudocode_summary` (LLM), and
  "Generate split PRs".
- Tying findings to the GitHub-comments toggle (D11).
- Sticky group headers: `PrDetailHeader` is sticky at `top: 0` with no fixed
  height, so `top: 0` group headers would slide under it.
- A `position` column on `pr_files`, and fixing the untransacted
  delete/re-insert (Q2).
- Findings across multiple agents' latest reviews (Q1).
- Wiring the classifier into the reviewer prompt (L08).
- ~~Bars on every line of an `end_line` range~~ — **now in scope, D9 (Fix 1,
  2026-09-23):** a range with no rendered line still gets only one "Outside
  the diff" entry, never one per line.

## 10. Acceptance

- **A1** `diff -r client/src/vendor/shared server/src/vendor/shared` lists only
  the five baseline files. `SmartDiffRole.options` is
  `['core','tests','wiring','docs','boilerplate']` in both copies.
- **A2** `GET /pulls/<#499 id>/smart-diff` returns five groups in that order.
  `pnpm-lock.yaml` is under `boilerplate` and `package.json` under `wiring`. The
  body parses with `SmartDiffResponse`, and the mock records no LLM call.
- **A3** An unreviewed PR (#479) returns `review_id: null`, groups populated and
  every `finding_lines` empty.
- **A4** On #482, `src/config.ts` is in `wiring` with `finding_lines: [12]`,
  and `src/api/users.ts` is in `core` with `[45]`.
- **A5** Dismissing a finding removes its line from the next response, and
  accepting one does not.
- **A6** T1 passes with the three required edge cases, and the `e2e/README.md`
  row explains its decision.
- **A7** Files changed on #499 shows "REVIEWER-ORDERED DIFF", "7 files · +… −…"
  (the real sums), and headers Core logic → Tests → Wiring → Docs →
  Boilerplate, each with a description and "N files". #482 shows only Core
  logic and Wiring (empty groups are hidden).
- **A8** On load, Docs and Boilerplate are collapsed (`pnpm-lock.yaml` is not in
  the DOM), and Core logic, Tests and Wiring are expanded.
- **A9** After the seeded review, Core logic shows "● 2", Tests "● 1" and Wiring
  nothing. On #482, Core logic and Wiring each show "● 1".
- **A10** Each file with an undismissed finding has the dot after its path.
  Files without one have no dot. The GitHub comment counter is unchanged.
- **A11** In an expanded file, the cited `start_line` row has a left bar and a
  right "blocker" / "warning" / "suggestion" pill. Directly under it sits a
  `FindingCard` with severity, title, category, rationale, suggested fix and
  Accept/Reject.
- **A12** Reject in the diff mutes the card. If that was the file's only
  finding, the dot and one group count disappear. The Agent runs tab shows the
  same status without a reload.
- **A13** A finding whose `start_line` is not a rendered line appears under
  "Outside the diff" at the end of its file (T5).
- **A14** "Original order" renders one flat list **sorted by path**
  (`path.localeCompare`, not `pr.files`'s own order — Fix 2, D11) with no
  group headers. "Smart order" restores the groups.
- **A15** On a PR with no review: no dots, no "● N", and the "No review yet"
  line.
- **A16** `git diff --stat` touches no file under `FindingCard/`,
  `FindingsPanel/` or `ReviewRunAccordion/`.
- **A17** A review finished from the Agent runs tab updates the counts on Files
  changed without a reload.
- **A18** Every new string resolves through `next-intl`, and no `smartDiff`
  key that existed before is removed.
- **A19** `make test`, `make test-it`, `make typecheck`, `make lint`,
  `make lint-arch` and `make e2e` pass. The `diff -r` from A1 holds. The PR
  page has been opened in a browser (value import).

## 11. Execution — stages and agents

Each step is one delegation and is verified before the next starts.

| Step | Work | Agents |
|---|---|---|
| 1 | §3 contracts | implementer → check A1 |
| 2 | §4 classifier | test-writer (T1, red) → implementer (green) → architecture-reviewer (engine placement, purity) |
| 3 | §5 module and route | test-writer (T2, T3) → implementer → architecture-reviewer (rings, `make lint-arch`) |
| 4 | §6 fixture and docs | implementer (T4 must pass); doc-writer for `seed-contract.md` and `findings-surfaces.md` |
| 5 | §7 step 5, diff-viewer seam | test-writer (T5) → implementer |
| 6 | §7 step 6, Smart Diff view, hooks, i18n | test-writer (T6, T7) → implementer; browser check |
| 7 | e2e | test-writer (T8) |
| 8 | Review | security-reviewer (LLM-written `title`/`rationale`/`suggestion` rendered in the diff: `Markdown` is `react-markdown` without raw HTML; `title` attributes are text) |
| 9 | Verify | plan-verifier: §10 A1–A19 and §9 |

The PR description lists the sub-agents used per step and the plan-verifier
verdict.

## 12. Open questions

None blocking.
- **Q1** [non-blocking] "Run all" writes one review per agent, and only the
  newest one feeds the diff. Should Smart Diff instead merge the latest review
  of **each** agent? Default: newest only, consistent with the PR list (D4).
- **Q2** [non-blocking] "Original order" is GitHub's order on the live path.
  Offline it is Postgres heap order, with no ORDER BY and no position column.
  Should a `pr_files.position` column be added in its own spec? Default: accept
  for now.
- **Q3** [non-blocking] Prompt templates (`server/src/prompts/*.md`) classify
  as docs and start collapsed. Should there be a core override for `prompts/`?
  Default: no; revisit with L08's filter.

## What we're building

- Files changed tab titled "Reviewer-ordered diff" with a "N files · +A −D" stats row
- Files grouped Core logic → Tests → Wiring → Docs → Boilerplate; each header shows colour, label, description and file count
- Empty groups hidden; Docs and Boilerplate collapsed by default; the other groups follow the 200-line auto-expand rule, and files with findings open
- Group header "● N" = files in the group with findings from the latest review
- A dot on each file card that has findings, separate from the comment counter
- Under the cited line: a coloured left bar, a blocker/warning/suggestion pill, and the Agent-runs `FindingCard` with working Accept/Reject
- Findings off the rendered lines listed under "Outside the diff" at the end of the file
- A Smart order / Original order toggle
- A "No review yet" hint; counts refresh after a review or a dismiss without a reload
- `GET /pulls/:id/smart-diff`: five groups in fixed order, `finding_lines`, `review_id`, minimal `split_suggestion`, no LLM, response schema enforced
- `classifyFile(path)` in reviewer-core: first match wins over boilerplate → tests → wiring → docs → core, with a table-driven test
- `SmartDiffRole` widened to five values in both shared copies
- Seeded PR #499 covering all five roles with a reviewed finding set, plus e2e flow 11
