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

- **2026-10-10** — `make e2e` ending "2/17 flows passed", with every data flow
  timing out on `wait --url /pulls` or `wait --text` and the page showing "No
  repo selected", means the automation browser cannot reach the API port. On
  this machine agent-browser 0.38.1 (HeadlessChrome 153) fails every fetch
  from the web port to another local port with `Failed to fetch`, while
  `curl` gets 200 from the same URL. The flows are not the cause, so do not
  re-run the 6-minute lane. Check in ten seconds against a running stack:
  `agent-browser open http://localhost:3000/agents && agent-browser eval
  "fetch('http://localhost:3001/health').then(r=>r.status).catch(e=>'ERR '+e.message)"`.
  Not fixed by `AGENT_BROWSER_ARGS=--disable-features=LocalNetworkAccessChecks`,
  `AGENT_BROWSER_ALLOWED_DOMAINS`, another port, a fresh browser or running
  outside the sandbox. Cause not found as of this date; flows 15 to 17 were
  written without ever running.
  `scripts/e2e.sh:45`
  **Fixed 2026-10-10 in `scripts/e2e.sh` (`API_HOST=localhost`).** The exact
  error is `net::ERR_ADDRESS_INVALID`, and it is not cross-origin: this
  browser cannot connect to IPv4 loopback at all, even on a direct visit to
  `http://127.0.0.1:<port>`, while `::1` works and `curl -4` is fine. The web
  server listens on both families and the API's default bind is `127.0.0.1`
  only, so pages loaded and every API call failed. With `localhost` Fastify
  binds `127.0.0.1` and `::1` and the lane is 17/17. Why this machine blocks
  IPv4 loopback for the test Chrome is still unknown (macOS Local Network
  permission and a connected NordVPN are the two candidates); the dev stack
  keeps the IPv4-only bind. `agent-browser` reuses a running browser, so
  `--args` and `AGENT_BROWSER_ARGS` silently do nothing unless the lifecycle
  line says `launched: true`.

## Open Questions
