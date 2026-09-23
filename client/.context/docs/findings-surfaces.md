# Findings, severity and cost — where each surface gets its numbers

Five UI surfaces show a review's findings, severities or cost. They read two
different endpoints and do not all count the same set, so a number that
"disagrees" between two surfaces is usually one of the rules below, not a bug.

| Surface | Component | Data | Counts dismissed? |
|---|---|---|---|
| PR list · Findings icons | `pulls/_components/FindingsCell` | `PrMeta.findings` from `GET /repos/:id/pulls` (latest review) | no |
| PR list · hover popover | `FindingsCell/FindingsPopover` | `usePrReviews` on first hover → `latestRunFindings()` | no |
| PR list · Cost | `PRRow` → `CostBadge` | `PrMeta.cost_usd` — sum over all `done` runs | — |
| Agent runs · Timeline row | `RunHistory` + `SeverityCounts` | `severityCountsByRun(reviews)` joined on `run_id`; cost from `RunSummary.cost_usd` | no |
| Agent runs · Review runs pills + filter | `ReviewRunAccordion` → `FindingsPanel` | `review.findings` from `usePrReviews` | **yes** |
| Trace drawer · COST tile + findings | `RunTraceDrawer` | `useRunTrace` stats; findings passed from the page's reviews | yes |
| Files changed · Smart Diff | `DiffTab` → `useSmartDiff` | `GET /pulls/:id/smart-diff` `finding_lines` per file, from the latest review | no |

Paths are under `src/app/repos/[repoId]/pulls/`.

## Rules worth knowing

- **Latest review, not all runs**, for every severity count on the PR list.
  Cost is the exception: it is total spend across runs.
- **The accordion counts dismissed findings; the list and timeline don't.** The
  accordion shows dismissed cards (struck through) in its list, so its pills
  count what is below them: a pill equals the number of cards of that severity
  whenever "hide low confidence" is off.
- **Pills show only severities present**, and the filter is single-select:
  click narrows to one level, clicking it again clears.
- **No LLM on any of these paths.** Every number is grouped from persisted
  findings, in SQL (list) or in the component (everything else).
- **Smart Diff follows the latest-review rule too, and does not count
  dismissed.** `finding_lines` holds only undismissed `start_line`s from the
  newest `kind='review'` row (same rule as the PR list); a dismissed finding's
  inline `FindingCard` still renders in the diff, muted, same as everywhere
  else `FindingCard` appears.
- **One formatter for money**: `formatUsd` in `@devdigest/ui` — `null` → `—`,
  `≥ $1` → 2 dp, below that 3 dp, and 4 dp when 3 would print `$0.000`.

## The popover is portalled

The PR table's `tableCard` style has `overflow: hidden`, so `FindingsCell`
renders its popover into `document.body` with `position: fixed`. React still
bubbles events from a portal up the component tree, which is why the popover
stops click propagation — otherwise a click on a preview reaches `PRRow` and
navigates to the PR.
