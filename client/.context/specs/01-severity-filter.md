# 01 — Severity filter

Severity counters with click-to-filter on the PR page. Lesson L01
("Severity filter on findings").

## Why

A review run's findings render as one flat, severity-sorted list. Nothing tells
you the shape of the run at a glance — how many blockers versus how much noise —
and there is no way to narrow to one level. On a run with a dozen findings you
scroll to answer "how bad is this?".

The starter's code is visibly shaped around this feature's removal:
`FindingsPanel`'s toolbar has an empty left slot with the toggle pushed right by
`marginLeft: "auto"`, `styles.ts` carries a `divider` style transcribed from the
artboard but used nowhere, and the empty-state copy already reads "Adjust the
filters **above**" (plural).

Design: `.context/docs/design/src/findings.jsx:102-124`.

## Surfaces

Severity counts appear on 7 surfaces across the design bundle; 1 is in scope.

| # | Screen | Design | What lands |
|---|---|---|---|
| 1 | PR detail · Agent runs · Review runs · expanded run, under the verdict and PR SCORE | `findings.jsx:113-117` | Pill row `N CRITICAL · N WARNING · N SUGGESTION`; clicking a pill narrows the list to that level |

## Decisions

- **Per review run, not per PR.** `FindingsPanel` renders once inside each
  `ReviewRunAccordion`, so the counts and the filter are that run's and the
  state is naturally scoped. A PR-level aggregate would double-count the same
  issue across re-runs of the same agent.
- **Single-select, nothing selected by default.** Clicking a pill shows only
  that severity; clicking the same pill again clears the filter and restores
  the run's full list; clicking another pill switches to it. State is one
  `string | null`. This departs from the artboard, whose chips are a
  multi-select inclusion set where a click *hides* a level — the homework
  acceptance criteria require "click leaves only this severity".
- **Counts are over the run's full finding set**, computed before both the
  severity filter and `hideLow`, so a pill's number never moves as you filter
  and always equals the number of cards for that level when nothing else is
  narrowing the list.
- **Only severities present in the run draw.** A zero-count level gets no pill
  (`presentSeverities`), and a run with no findings gets no pill row. If a
  refetch removes the last finding of the selected level, the filter falls back
  to "all" rather than stranding an empty list behind a pill that is gone.
- **Label is count first, uppercase level**: `panel.severityPill` =
  `"{count} {label}"`, with `panel.severity.*` in caps, separated by a
  decorative `·`. The count goes in the label, not `Chip`'s trailing `count`
  slot, so the pill reads `2 CRITICAL`.
- **Three levels only.** The `Severity` contract has exactly `CRITICAL |
  WARNING | SUGGESTION`. `INFO` exists in the kit's token union and in
  `SEVERITY_ORDER` but never in data, so it stays out of the row and stays in
  the sort map.
- **Accept / Reject on each card.** The dismiss action's button and tag read
  "Reject" / "rejected" (`finding.dismiss`, `finding.dismissed`). Only the copy
  changed: the API action and the `dismissed_at` column keep their names, so
  the i18n keys follow the data model, not the label.
- **Filter order** is severity → hide-low-confidence → sort by severity, so the
  two toolbar controls compose.
- **Labels come from i18n, icon and colour from the kit.** `panel.severity.*`
  in `messages/en/prReview.json` per the package's string convention; `SEV`
  (`vendor/ui/primitives/tokens.ts`) supplies the glyph and hue so the chip
  matches the `SeverityBadge` on each card.
- **`Chip` is reused as-is**, not re-implemented: `active`, `icon` and `color`
  are exactly this control. Same pattern as the PR list's `FilterBar`.
- **Client-only.** `review.findings` already arrives with the run, so there is
  no server, contract or migration work, and neither vendored `shared/` copy is
  touched.

## Out of scope

The artboard's "All categories" chip (`findings.jsx:118`, a category filter) and
the other six count surfaces: the Timeline run strip
(`prdetail_runs.jsx:56-72`, read-only, needs per-severity columns on
`agent_runs`), the PR-list Findings column (`screen_dashboard.jsx:44-59`), CI
runs (L06) and multi-agent review (L07).

`Chip` renders a plain `<button>` with no `aria-pressed`, so a screen reader
cannot tell a filter is on. Fixing it means an additive prop on vendored kit
code and would also improve `FilterBar`, which has the same gap.
