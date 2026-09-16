# 02 — Severity badges

Per-severity finding counts (icon + number) on the PR list and the Agent runs
timeline. Lesson L01, follow-up to `client/.context/specs/01-severity-filter.md`.

## Why

Both surfaces reduce a review to one number today: the PR list shows no
findings at all, and a timeline run row reads "3 findings · 2 blockers". You
cannot tell two criticals from three suggestions without opening the PR and
expanding the run.

The starter is shaped around the removal: `pulls/routes.ts` says the
per-severity breakdown "is intentionally not surfaced on the list", and
`lib/types.ts` still carries an unused `PrRowView.findings` in exactly the
design's shape.

## Surfaces

The design draws severity counts on 5 surfaces; 2 are in scope, 1 is already
built.

| # | Screen | Design | Status |
|---|---|---|---|
| 1 | PR list · Findings column | `screen_dashboard.jsx:43-58` (`FindingsCell`) | **this spec** |
| 2 | PR detail · Agent runs · Timeline run row | `prdetail_runs.jsx:60-73` (`RunFindings`) | **this spec** |
| 3 | PR detail · review run toolbar chips | `findings.jsx:113-117` | done — spec 01 |
| 4 | CI Runs · Findings column | `screen_cizruns.jsx:9-14` | out — L06 |
| 5 | Multi-agent review columns | `screen_multiagent.jsx:3-10` | out — L07 |

Not surfaces, checked and excluded: the Review Runs accordion header
(`prdetail_runs.jsx:122`) is plain "N findings · M blockers" text in the
design too, and Compose Review (`screen_pr_detail.jsx:91`) draws one icon per
finding, not counts.

## Decisions

- **One shared primitive, `SeverityCounts`**, in `vendor/ui/primitives/`.
  Surfaces 1, 2 and 4 are the same markup in the design (icon + `tnum` count,
  `SEV` colour, dotted underline), so it's built once, like `CostBadge`.
- **Only non-zero levels draw**, in CRITICAL → WARNING → SUGGESTION order —
  the design's `filter(n > 0)`. Unlike spec 01's chips, this is a read-only
  summary, so a stable three-slot shape buys nothing. All-zero renders an
  `empty` prop: `—` on the PR list, the existing "0 findings" text on the
  timeline.
- **PR list counts the latest review only**, the same review the Score column
  reads. Summing every run (as Cost does) would double-count one issue found by
  two agents.
- **Dismissed findings are excluded** on both surfaces, matching
  `ReviewRunAccordion`'s blocker count.
- **No migration.** The PR list computes counts on read (one grouped query over
  `findings` for the latest review ids), the way `score` already is. The
  timeline derives them client-side: `FindingsTab` already holds every
  `ReviewRecord` with its findings, joined to runs by `run_id`.
  `agent_runs.findings_count` is `findingRows.length` — the same set — so the
  numbers agree.
- **Blockers suffix stays** on the timeline (`· 2 blockers`), as in the design.
  It's the gate count, not a severity count.
- **No hover tooltip.** The design pairs both surfaces with `FindingsTooltip`;
  on the PR list that means shipping every PR's findings through the list
  endpoint. Deferred.
- **Each count carries `title`/`aria-label`** ("2 critical") — an icon and a
  bare digit say nothing to a screen reader. The text comes from the kit's
  `SEV[].label`, like `SeverityBadge`; the vendored kit has no i18n.

## Changes

### Contract — both vendored copies (`server/src/vendor/shared`, `client/src/vendor/shared`)

- `contracts/findings.ts` — add `SeverityCounts = z.object({ CRITICAL, WARNING,
  SUGGESTION })`, each `z.number().int()`.
- `contracts/platform.ts` — `PrMeta.findings: SeverityCounts.nullish()`, list
  endpoint only; null/absent until reviewed (same contract as `score`).

### Server

- `modules/pulls/routes.ts` — select the latest review's `id` alongside its
  `score`; one query over `findings` grouped by `review_id, severity` where
  `dismissed_at IS NULL`; fold into `findings` on each row. Replace the
  "intentionally not surfaced" comment.
- `test/contracts.test.ts` — `PrMeta.findings` optional + nullable.
- `test/integration.it.test.ts` — seeded PR #482 lists
  `{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }`; an unreviewed PR lists `null`;
  a dismissed finding drops out; a newer review replaces, not adds.

### UI kit (`client/src/vendor/ui`)

- `primitives/SeverityCounts.tsx` — new. Props `counts`, `size?`, `empty?`.
- `primitives/SeverityCounts.test.tsx` — order, zero-skipping, `empty`, labels.
- `primitives/index.ts` — export. `README.md` — add to the Primitives row.
- `client/src/components/showcase/Showcase.tsx` — render it (the smoke test
  mounts the showcase).

### PR list (`client/src/app/repos/[repoId]/pulls/`)

- `constants.ts` — `COLUMN_KEYS` gains `findings` after `score`; `GRID` gains a
  116px track in the same slot.
- `_components/PRRow/PRRow.tsx` — Findings cell between Score and Status.
- `_components/PRRow/PRRow.test.tsx` — new: counts render, `—` when unreviewed.
- `client/messages/en/prReview.json` — `list.columns.findings`.

### Timeline (`client/src/app/repos/[repoId]/pulls/[number]/_components/`)

- `FindingsTab/helpers.ts` (+ test) — `severityCountsByRun(reviews)`.
- `FindingsTab/FindingsTab.tsx` — build `run_id → SeverityCounts` from `runs`,
  pass to `RunHistory`.
- `RunHistory/RunHistory.tsx` — optional `severityCounts` prop; settled rows
  render `SeverityCounts` + blockers suffix, falling back to today's text when
  a run has no matching review.
- `RunHistory/RunHistory.test.tsx` — counts render; fallback when absent.

### E2E

- `e2e/specs/02-repo-pulls-detail.flow.json` — wait for the "Findings" column
  header.

## Out of scope

The hover tooltip; surfaces 4 and 5; the Review Runs accordion header.
