# e2e — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the browser suite but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — `wait --url tab=config` is NOT enough before clicking a tab:
  every editor route renders a `Skeleton` until its TanStack Query resolves,
  and `--url` matches the moment the URL changes, so the tab row does not exist
  yet and `find role button --name <Tab>` exits non-zero. Put
  `wait --load networkidle` between them. Same root cause as the client's
  `loading.tsx` insight — nothing here fetches server-side.
  `e2e/specs/08-skills.flow.json`

## Tool & Library Notes

- **2026-09-23** — `agent-browser wait --text` matches rendered
  `innerText`, case-sensitively, so CSS `text-transform` applies: a
  `SectionLabel` whose copy is "Reviewer-ordered diff" must be asserted
  as `"REVIEWER-ORDERED DIFF"`. Asserting the i18n string as written
  times out with no hint about casing. Check the rendered form with
  `document.querySelector(…).innerText` before writing the step.
  `e2e/specs/11-smart-diff.flow.json`, `e2e/specs/10-pr-intent.flow.json:11`

- **2026-09-20** — `agent-browser find role button click --name X` does **not**
  fail on an ambiguous match: with three identically-named buttons it exits 0 and
  clicks the FIRST one. Verified against a throwaway page — after the click the
  DOM read `Accept all|Accepted|Reject|Accept|Reject|Accept|Reject` and the
  page's counter moved to "1 of 3". So a per-row action inside a list is
  locatable without adding a `data-testid`, which is why flow 09 asserts
  `1 of 3 accepted` after one click.
  `--exact` is load-bearing, not decoration: `--name` defaults to a
  **case-insensitive substring** of the accessible name, so a bare
  `--name Accept` also matches "Accept all" and "Accepted". `find
  first`/`last`/`nth` exist but take CSS selectors, not roles — there is no
  "nth matching role" locator.
  Note this is a different failure mode from the Codebase Patterns entry above:
  a locator exits non-zero when the element does not exist YET (a skeleton still
  rendering), not when it matches more than once.
  `e2e/specs/09-conventions.flow.json`

## Recurring Errors & Fixes

## Open Questions
