# 01 — PR list: assert the L01 Cost and Findings columns

Browser coverage for the two PR-list columns L01 added. Product design is in
the root specs [`01-run-cost.md`](../../../.context/specs/01-run-cost.md) and
[`02-severity-badges.md`](../../../.context/specs/02-severity-badges.md).

## Why

Both columns are computed on read by `GET /repos/:id/pulls` and rendered by
`PRRow`. Unit and integration tests cover each half; nothing proved the two
meet in a real browser on seeded data.

## Change

Two `wait` steps in `specs/02-repo-pulls-detail.flow.json`, after the seeded PR
row is visible and before it is clicked:

| Step | Asserts |
|---|---|
| `wait --text "$0.014"` | the Cost column shows PR #482's seeded run total |
| `wait --text "Findings"` | the Findings column header renders |

## Decisions

- **Extend flow 02, don't add a flow.** It already stands on the PR list with
  PR #482 visible, and flows share one browser session in order — a new flow
  would re-navigate to the same page.
- **`$0.014` is a seed contract.** It comes from the `agent_runs` row
  `server/src/db/seed.ts` attaches to the sample review. Changing that value,
  or `formatUsd`'s precision, breaks this step on purpose.
- **Header text, not the counts.** The counts render as icon + digit with the
  number in an `aria-label`; `wait --text` on a bare `1` would match anywhere
  on the page. The header proves the column is wired; the integration test
  owns the numbers.
- **The hover popover is not asserted.** It needs a pointer hover and a lazy
  fetch; the component test (`FindingsCell.test.tsx`) covers it
  deterministically.
