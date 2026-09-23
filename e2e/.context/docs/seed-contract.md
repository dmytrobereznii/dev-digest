# Seed contract — the values the flows wait for

Every flow asserts on text that `server/src/db/seed.ts` writes. Changing one of
these values in the seed (or its formatting in the client) fails the flow that
waits for it, with a `wait --text` timeout rather than a readable diff. Grep
this table before touching the seed.

| Value | Written by the seed as | Rendered by | Flows |
|---|---|---|---|
| `acme/payments-api` is the **first** repo | the only seeded repo | home redirect → `/repos/<id>/pulls` | 01, 02, 04, 05 |
| `Add rate limiting to public API endpoints` | PR #482 title | `PRRow`, PR detail header | 02, 04, 05 |
| `/pulls/482` | PR number | detail route | 02, 04, 05 |
| `$0.014` | `agent_runs.cost_usd = 0.014` on the sample review's run | `CostBadge` via `formatUsd` (`< $1` → 3 dp) | 02 |
| `request changes` | sample review `verdict: 'request_changes'` | accordion verdict badge (`_` → space) | 04 |
| `2 findings` | two findings on the sample review | `ReviewRunAccordion` header | 04 |
| `Hardcoded Stripe secret key in commit` | the CRITICAL finding's title | first `FindingCard` | 04 |
| `src/config.ts` | seeded file patch | diff viewer | 05 |
| `Security Reviewer` | built-in agent name | agents list | 03 |

Flows 01, 06 and 07 assert only static UI copy.

## Why the first-repo rule matters

Flows `02`, `04` and `05` follow the home redirect, which picks the first repo.
On a dev DB with another imported repo they land on the wrong PR list and time
out waiting for PR #482. `make e2e`'s fresh stack is the safe way to run them.

## The `$0.014` run is self-healing

The sample review predates `agent_runs`, so the seed attaches its run in a
separate block that only fires when `reviews.run_id` is null. A DB seeded
before L01 gains the run on the next `pnpm db:seed`; it does not need a reset.

## The other demo PRs do not touch this contract

Since `server/src/db/seed-prs/`, the seed also writes PRs **#479**, **#486**
and **#474** on the same repo. They were chosen not to collide with anything
above:

- they ship **unreviewed** — no review, findings, run or cost — so nothing they
  add can shadow `$0.014`, `2 findings`, `request changes`, or the seeded
  finding title. #482 and #499 are the only PRs with a review on a fresh DB;
- no title duplicates a value in the table, and `find text` matches exactly;
- they stay on `acme/payments-api`, so the first-repo rule still holds. **A new
  fixture must never introduce a second repo** — that is what breaks 02/04/05;
- all three derive `needs_review`, so they sit beside #482 and #499 under the
  list's default filter rather than displacing them.

A fixture that *does* carry a seeded review has to be re-checked against this
table before it lands, because a second review on the list changes what the
Findings and Cost columns show.

## #499 — the Smart Diff fixture, the second reviewed PR

`server/src/db/seed-prs/499-retry-window.ts` (spec
`.context/specs/08-smart-diff.md` §6) is the second exception to "ships
unreviewed": `GET /pulls/:id/smart-diff` needs a PR whose files cover every
role (core, tests, wiring, docs, boilerplate) *and* carries a reviewed finding
set, which is a state no real run can be made to produce on demand.

| Value | Written by the seed as |
|---|---|
| `Cap payout retries with a sliding window` | PR #499 title — duplicates nothing above |
| `pnpm-lock.yaml` | its boilerplate-role file |
| `package.json` | its wiring-role file (not boilerplate — D2 in the spec) |
| `docs/retry-window.md` | its docs-role file |
| `src/lib/retry-window.ts`, `src/api/payouts/retry.ts` | its core-role files, carrying the CRITICAL and WARNING findings |
| `test/lib/retry-window.test.ts` | its tests-role file, carrying the SUGGESTION finding |

Like #482, `lastReviewedSha: null` keeps it `needs_review` under the list's
default filter despite carrying a review — a seeded review does not by itself
flip the derived status (`server/src/modules/pulls/status.ts`). Flow
`e2e/specs/11-smart-diff.flow.json` asserts on #499; a new #499 assertion in
another flow must be re-checked against this table the same way a new #482
assertion would be.
