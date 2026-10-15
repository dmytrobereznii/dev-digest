# Spec: Eval Pipeline
Spec ID: SPEC-13
Status: implemented
Supersedes: —

## Problem and user

The person who configures DevDigest's reviewer agents changes a system prompt,
a model or a linked skill and has no way to tell whether the agent got better
or worse. Today the only check is to re-run a review on some PR and read the
findings by eye. The user's own triage is already stored: every finding
carries an accept or dismiss decision
(`server/src/db/schema/reviews.ts:41`,
`server/src/modules/reviews/findings.ts:11-34`), and that code says the
decisions are "the dataset later lessons build on". Nothing reads them.

The starter ships dormant scaffolding and nothing that uses it: tables
`eval_cases` and `eval_runs` (`server/src/db/schema/eval.ts:7-35`), contracts
`EvalCase`, `EvalRun`, `EvalPerTrace` (`server/src/vendor/shared/contracts/knowledge.ts:50-84`)
and `EvalCaseInput`, `EvalRunRecord`, `EvalDashboard`
(`contracts/eval-ci.ts:20-89`), an unused message file
(`client/messages/en/eval.json`), a nav key (`client/src/components/app-shell/helpers.ts:35`).
No module, route, page, hook, seed or test exists
(`server/src/modules/index.ts:28`).

This spec is the L06 homework: regression protection for the product's review
agents. Cases live in Postgres next to the findings they come from; a run
replays the agent on frozen inputs; scoring is code, not a model.

Terms, each with one meaning:

- **Eval case**: one stored test for one agent: a frozen input and one
  expectation. Unrelated to the `evals/` package and the `make eval-*`
  targets, which test the Claude Code harness.
- **Expectation**: a type (`must_find` or `must_not_flag`) plus a file and an
  inclusive 1-based new-side line range.
- **Case set**: all eval cases owned by one agent.
- **Frozen input**: what is stored on the case when it is created.
- **Eval run**: one execution of the configuration an agent has when the run
  is created, against every case of its set, with one result per case and one
  set of metrics.
- **Surviving finding**: a finding the grounding gate kept
  (`reviewer-core/src/grounding.ts:52`). A **dropped finding** is one it
  removed.
- **Completed run**: an eval run with status `completed`. Only completed runs
  have metrics.
- **Last result** of a case: its result in the agent's most recent completed
  run that included it; a case with none is **never run**.
- **Point (pt)**: one percentage point.

## Goals / Non-goals

Goals

- G1. The user turns a triaged finding into an eval case in one click, for
  both decisions: accepted → `must_find`, dismissed → `must_not_flag`.
- G2. The user sees every case in an agent's set, can read what a case
  holds, and can delete a case.
- G3. The user runs the agent's current configuration on the whole set, with
  inputs that do not change between runs.
- G4. The user sees recall, precision and citation accuracy for a run,
  computed in code with no model call.
- G5. The user sees the latest eval runs across agents and an agent's run
  history.
- G6. The user compares two runs of one agent side by side: metric deltas and
  the system prompt each run used.
- G7. The feature is verifiable without an API key: `pnpm verify:l06`, a
  seeded data set and a browser flow.

Non-goals

- Creating or editing a case by hand: no "New eval case" button, no edit icon,
  no editable field in the case modal (`05`, `06`; course page "stretch").
- An eval for a harness skill in `evals/`, a PreToolUse hook, mutation testing
  (course page "stretch").
- The "Export" half of the homework title: no export to CI.
- The Learn and "Reply to author" buttons drawn in `01`; they do not exist in
  the product (`FindingCard.tsx:91-112`).
- The alert banner ("Precision dipped 2pts…"), "Run all agents", "Promote vN",
  the "30 days" range control and the agent-switcher dropdown (`02`, `03`,
  `04`).
- Skill-owned cases: `owner_kind = 'skill'` stays unused, and the Skill
  editor's Evals tab (`canvas.jsx:105`) is not built.
- The Stats and CI tabs drawn beside Evals in `05`.
- Running one case on its own: the play icon per row in `05` and "Run case" in
  `06` (D11). A run always covers the whole set.
- Storing a run's linked skills, and showing a skill change in Compare (D13).
- Compare, and run selection, on the Evals tab: they live on the agent view
  only (D12).
- The "Files" input tab of the case modal (`06`): a case stores no file
  contents (D5).
- Feeding repo map, callers, intent, project-context documents or memory to an
  eval run (D5).
- Narrowing the stored diff to the hunk around the finding: the fragment is
  the whole stored patch of the finding's file (D5).
- Replaying a past agent version: a run always uses the current configuration
  (D1).
- Cancelling a run in progress, and a live log or trace view for an eval run.
- Making the agent's output repeatable: two runs of one configuration may
  differ, because the model may. Only scoring is deterministic.
- New or changed MCP tools. `mcp/` keeps its own response schemas
  (`mcp/src/api/schemas.ts:97`).
- Pagination of case lists and run tables.

## Decisions

D1–D9 were settled in the task and D10–D15 are the user's answers to this
spec's six questions; the user confirmed all of them on 2026-10-10.

- D1. An eval run executes the agent's current configuration at the moment
  the run is created. The run stores the agent's version number, the system
  prompt text, the model and the provider at that moment, and every case of
  the run executes those stored values, so an edit made while the run is in
  progress changes neither what runs nor what Compare shows. The agent's
  linked enabled skills are resolved when the run's execution starts. Two runs
  stay comparable after later edits. "Old vs new prompt" is: run, edit the
  prompt (the existing versioning bumps `agents.version`,
  `server/src/modules/agents/repository.ts:109-139`), run again.
- D2. Precision counts judged locations only; see _Scoring definitions_.
- D3. In scope from the screenshots: the sparkline per agent on the dashboard,
  the "Metric trend" chart on the agent view, and a read-only case modal built
  on `06` with its editing controls removed.
- D4. A case belongs to the agent whose review produced the finding. One case
  per finding. A finding that is neither accepted nor dismissed cannot become
  a case; its control is present, disabled, with an explanation.
- D5. Frozen input is the diff fragment for the finding's file, copied from
  the PR's stored patch at creation, plus the PR title and description.
  Skills belong to the agent under test, not to the frozen input.
- D6. The shipped tables are reshaped by a new migration as needed. This spec
  states what is persisted and returned; table and column design is the
  plan's.
- D7. A case result is pass or fail; "traces passed" is cases passed over
  cases total.
- D8. `verify:l06` is a script in `server/package.json` with a matching Make
  target, green with no API key.
- D9. The demo's target agent is General Reviewer. It affects only
  _Definition of done and demo_.
- D10. A case is deletable from the Evals tab, after a confirmation step (the
  trash icon in `05`).
- D11. A single case is not runnable on its own.
- D12. The Evals tab also shows run history: a "Recent runs" list of the
  agent's 5 most recent runs, with the agent view's columns and no selection,
  beside the "View full dashboard" link. The course page asks for history on
  the tab; `05` draws only the tiles and the link.
- D13. Compare shows a notice when the two runs covered different case sets.
  Linked skills are not stored on a run, so a skill change is not visible in
  Compare.
- D14. History depths: sparkline 8 runs, trend chart 20, agent run table 20,
  all-agents table 10.
- D15. `verify:l06` may need Docker for the run-route check, and exits
  non-zero when that check cannot run.

Defaults this spec sets where the design shows no state. Each has an AC;
approve or change them with the spec.

- S1. A run is created in status `running` and finishes later as `completed`
  or `failed`, as review runs do
  (`server/src/modules/reviews/service.ts:108-133`).
- S2. One eval run per agent at a time.
- S3. A run in which any case fails to execute is `failed` and has no metrics
  and no case results, so every completed run covers its whole set.
- S4. A metric whose denominator is 0 has no value: stored as null, shown
  as "—".
- S5. Deltas are shown in points everywhere, including the agent view's metric
  cards that `03` draws as fractions ("0.04"). A delta is the difference of
  the two displayed whole percentages.
- S6. A case is never edited after creation: not when its finding's decision
  changes, and not when the finding, review or PR is deleted or re-imported.
  The only change a case can undergo is deletion by the user (D10), after
  which a new case can be created from the same finding.
- S7. The dashboard lists agents that have at least one case or one run.
- S8. At most two runs can be selected for Compare.
- S9. Deleting a case leaves past runs untouched: each run keeps its metrics
  and all its case results, including the deleted case's, with the stored
  `case_id` and `case_name`.
- S10. A case cannot be deleted while an eval run of its agent is `running`;
  the request is refused.

## User stories

- US-1: As an agent author, I want to turn a finding I accepted or dismissed
  into an eval case in one click, so that my triage becomes the test set.
- US-2: As an agent author, I want to see every case of an agent, open one and
  delete one, so that I know and control what the agent is tested on.
- US-3: As an agent author, I want to run the agent on all its cases, so that
  I can measure the configuration I have now.
- US-4: As an agent author, I want recall, precision and citation accuracy for
  a run, computed without a model, so that I can trust the numbers.
- US-5: As an agent author, I want the latest runs across agents and one
  agent's history, so that I can see a trend.
- US-6: As an agent author, I want to compare two runs side by side, so that I
  can see what a prompt change did.
- US-7: As a maintainer, I want one command and one browser flow that prove
  the feature without an API key, so that I can check it on a fresh checkout.

## External contract

Only one path is fixed, by the course page: `POST /agents/:id/eval-runs`. The
other routes are the plan's to shape. The field names below are binding where
an AC names them; they reuse the shipped names (`ran_at`, `traces_passed`,
`traces_total`, `citation_accuracy`, `cost_usd`, `duration_ms`,
`knowledge.ts:58-67`). Every new or changed contract goes into both vendored
copies of `@devdigest/shared`.

| Shape | Fields |
|---|---|
| Expectation | `type` (`must_find` \| `must_not_flag`), `file`, `start_line`, `end_line`, and for display only: `title`, `severity`, `category` |
| Eval case | `id`, `owner_kind` (`agent`), `owner_id`, `name`, `finding_id` (null once the finding is gone), `input_diff`, `input_meta` (`pr_title`, `pr_description`), `expected_output` (one Expectation), `created_at`, `last_result` (a Case result or null) |
| Eval run | `id`, `agent_id`, `status` (`running` \| `completed` \| `failed`), `ran_at`, `duration_ms` (number or null), `agent_version`, `system_prompt`, `model`, `provider`, `recall`, `precision`, `citation_accuracy` (each a number 0–1 or null), `traces_passed` (number or null), `traces_total` (the size of the set when the run was created), `cost_usd` (number or null), `error` (string or null) |
| Case result | `case_id` and `case_name` (both kept after the case is deleted), `expectation_type`, `pass`, `matched`, `unjudged`, `kept`, `dropped`, `findings` (the surviving findings: `file`, `start_line`, `end_line`, `title`, `severity`, `category`), `duration_ms`, `cost_usd` |
| Finding record | gains `eval_case_id` (string or null) beside `accepted_at` and `dismissed_at` (`contracts/review-api.ts:15-19`) |

Error codes: `finding_undecided`, `finding_agent_missing`, `diff_unavailable`,
`finding_outside_stored_diff`, `no_eval_cases`, `eval_run_in_progress`, each
with HTTP 409; an unknown id gives 404. `eval_run_in_progress` answers both a
second run request and a case deletion while a run of the agent is `running`.

On an eval run, `duration_ms` and `traces_passed` are null while the run is
`running` and on a `failed` run; `traces_total` is known from creation. The
agent's strategy is not a field of the run. Deleting an agent deletes its
cases, its runs and their case results.

### Scoring definitions

For a run over cases `c`, let `E(c)` be the case's expectation, `K(c)` the
surviving findings of the agent's execution on that case and `X(c)` the
dropped ones. Line ranges are normalised so that start ≤ end.

- `match(f, E)`: `f.file` equals `E.file` exactly, and
  `max(f.start_line, E.start_line) ≤ min(f.end_line, E.end_line)`.
- `matched(c)`: the number of findings in `K(c)` that match `E(c)`.
- `unjudged(c)`: `|K(c)| − matched(c)`.
- A `must_find` case passes when `matched(c) ≥ 1`. A `must_not_flag` case
  passes when `matched(c) = 0`.
- `TP`: the sum of `matched(c)` over `must_find` cases. `FP`: the sum of
  `matched(c)` over `must_not_flag` cases.
- `recall` = `must_find` cases passed / all `must_find` cases.
- `precision` = `TP / (TP + FP)`.
- `citation_accuracy` = `Σ|K(c)| / Σ(|K(c)| + |X(c)|)`.
- `traces_passed` = cases passed; `traces_total` = cases in the run.

Severity, category, title and confidence take no part in scoring.

## Acceptance criteria (EARS)

Percentages are shown as whole numbers, rounded half up.

### Creating a case from a finding

- AC-1 (US-1): The finding card shall show a "Turn into eval case" control in
  its action row after Dismiss, in the findings panel and in the inline diff
  (`FindingsPanel.tsx:101-111`, `DiffTab.tsx:105-113`; `01`).
- AC-2 (US-1): While a finding is neither accepted nor dismissed, the finding
  card shall render the control disabled with a text explanation, exposed as
  the control's accessible description, that the finding must be accepted or
  dismissed first.
- AC-3 (US-1): When the user activates the control on an accepted finding, the
  API shall store one eval case owned by the agent of the finding's review,
  whose expectation has type `must_find` and the finding's `file`,
  `start_line` and `end_line`.
- AC-4 (US-1): When the user activates the control on a dismissed finding, the
  API shall store one eval case owned by the agent of the finding's review,
  whose expectation has type `must_not_flag` and the finding's `file`,
  `start_line` and `end_line`.
- AC-5 (US-1): When a case is created, the API shall store as `input_diff` the
  PR's stored patch for the finding's file at that moment, preceded by the
  `--- a/<path>` and `+++ b/<path>` header lines (`06`;
  `server/src/modules/reviews/diff-loader.ts:36-42`).
- AC-6 (US-1): When a case is created, the API shall store the PR's title and
  description at that moment in `input_meta`.
- AC-7 (US-1): When a case is created, the API shall store a non-empty `name`
  derived from the finding's title in lowercase kebab-case.
- AC-8 (US-1): When a case is created, the API shall store the finding's
  title, severity and category on the expectation.
- AC-9 (US-1): The API shall return `eval_case_id` on every finding record,
  holding the id of the finding's eval case or null.
- AC-10 (US-1): While a finding has an eval case, the finding card shall
  render the control in a "created" state that sends no request when
  activated.
- AC-11 (US-1): When case creation succeeds, the finding card shall show the
  "created" state without a page reload.
- AC-12 (US-1): If a creation request names a finding that already has a case,
  then the API shall respond with the existing case.
- AC-13 (US-1): If a creation request names a finding that is neither accepted
  nor dismissed, then the API shall reject it with 409 `finding_undecided`.
- AC-14 (US-1): If a creation request names a finding whose review has no
  agent (`server/src/db/schema/reviews.ts:23`), then the API shall reject it
  with 409 `finding_agent_missing`.
- AC-15 (US-1): If the PR's stored files hold no patch for the finding's file,
  then the API shall reject the creation request with 409 `diff_unavailable`.
- AC-16 (US-1): If the grounding gate, applied to the finding against the
  diff fragment that would be stored, drops the finding, then the API shall
  reject the creation request with 409 `finding_outside_stored_diff`.
- AC-17 (US-1): If case creation fails, then the finding card shall show the
  API's error message, with the control still enabled.
- AC-18 (US-1): When a finding's decision changes after its case was created,
  the API shall leave the case's expectation unchanged.
- AC-19 (US-1): When a case's finding, review or PR is deleted or the PR is
  re-imported, the API shall keep the case with its `input_diff`, `input_meta`
  and expectation unchanged.

### The case set

- AC-20 (US-2): The agent editor shall offer an Evals tab that `?tab=evals`
  selects (`05`).
- AC-21 (US-2): The Evals tab shall list every case of the agent's set, one
  row per case, showing the case's name on one line, truncated when it does
  not fit.
- AC-22 (US-2): The Evals tab shall show on each row a badge naming the
  expectation: the severity and category for `must_find`, the text "must not
  flag" for `must_not_flag`.
- AC-23 (US-2): The Evals tab shall show on each row the case's last result as
  a pass or fail icon with the text "expected 1 finding, got N" for
  `must_find` or "expected 0 findings, got N" for `must_not_flag`, where N is
  `matched`.
- AC-24 (US-2): While a case is never run, the Evals tab shall show a neutral
  icon and the text "never run" on its row.
- AC-25 (US-2): The Evals tab shall show a badge "P / T passing", where P is
  the number of cases whose last result is a pass and T is the number of
  cases in the set.
- AC-26 (US-2): While the agent has no cases, the Evals tab shall show an
  empty state saying that cases are created from accepted or dismissed
  findings on a pull request.
- AC-27 (US-2): While the case list is loading, the Evals tab shall show a
  skeleton in place of the list.
- AC-28 (US-2): If the case list request fails, then the Evals tab shall show
  an error state with a retry control.
- AC-29 (US-2): When the user activates a case row, the Evals tab shall open a
  case modal showing the case's name, its `input_diff` with added and removed
  lines coloured, the stored PR title and description, the expectation, and
  the last result.
- AC-30 (US-2): The case modal shall offer no control that changes, saves or
  runs the case.
- AC-31 (US-2): While a case has a last result, the case modal shall show
  "Last run passed" or "Last run failed" with the expected and matched counts,
  the duration in seconds and the cost in USD.

### Running

- AC-32 (US-3): When the user activates "Run all evals" on the Evals tab or
  "Run eval" on the agent view, the client shall send
  `POST /agents/:id/eval-runs` for that agent.
- AC-33 (US-3): When `POST /agents/:id/eval-runs` is accepted, the API shall
  respond with the `id` and the `running` status of one newly stored eval
  run.
- AC-34 (US-3): When an eval run is created, the API shall store on it the
  agent's `version`, system prompt text, model and provider as they are at
  that moment.
- AC-35 (US-3): While executing an eval run, the API shall execute the agent
  once for each case that was in the set when the run was created.
- AC-36 (US-3): While executing a case, the API shall give the review engine
  the system prompt and model stored on the run, an LLM provider resolved from
  the provider stored on the run, the agent's linked enabled skills as
  resolved when the run's execution started, the case's `input_diff` and the
  case's stored PR description.
- AC-37 (US-3): While executing a case, the API shall give the review engine
  no repo map, callers digest, intent, project-context document or memory
  item.
- AC-38 (US-3): When every case of a run has been executed, the API shall
  store one Case result per case with the fields listed in _External
  contract_.
- AC-39 (US-3): When every case of a run has been executed, the API shall
  store the run with status `completed`, its three metrics, `traces_passed`,
  `traces_total` and `duration_ms`.
- AC-40 (US-3): When a run completes, the API shall store `cost_usd` as the
  sum of the cases' costs, or null when any case's cost is unknown
  (`server/src/adapters/llm/pricing.ts:37`).
- AC-41 (US-3): If the agent's execution fails for a case, then the API shall
  store the run with status `failed`, an `error` naming the case and the
  cause, null metrics and no case results.
- AC-42 (US-3): If the agent's execution fails for a case, then the API shall
  make no further LLM call for that run.
- AC-43 (US-3): If `POST /agents/:id/eval-runs` names an agent with no cases,
  then the API shall reject it with 409 `no_eval_cases`.
- AC-44 (US-3): While an eval run of the agent has status `running`, if
  `POST /agents/:id/eval-runs` names that agent, then the API shall reject it
  with 409 `eval_run_in_progress`.
- AC-45 (US-3): When the API starts, it shall set every eval run left in
  status `running` to `failed` with an `error` saying the run was interrupted
  (`server/src/app.ts:70-82`).
- AC-46 (US-3): While the agent has no cases, the Evals tab and the agent view
  shall render their run controls disabled.
- AC-47 (US-3): While an eval run of the agent has status `running`, the Evals
  tab and the agent view shall render their run controls disabled with a
  "Running…" label.
- AC-48 (US-3): When a run reaches `completed`, the Evals tab and the agent
  view shall show its metrics and case results within 5 seconds, without a
  page reload.
- AC-49 (US-3): While the agent's most recent run has status `failed`, the
  Evals tab and the agent view shall show that run's `error` text beside the
  run control.

### Scoring

- AC-50 (US-4): The eval scorer shall treat a surviving finding as matching an
  expectation when `match(f, E)` in _Scoring definitions_ holds.
- AC-51 (US-4): The eval scorer shall mark a `must_find` case passed when
  `matched ≥ 1` and failed otherwise.
- AC-52 (US-4): The eval scorer shall mark a `must_not_flag` case passed when
  `matched = 0` and failed otherwise.
- AC-53 (US-4): The eval scorer shall compute `recall` as `must_find` cases
  passed divided by all `must_find` cases of the run.
- AC-54 (US-4): The eval scorer shall compute `precision` as `TP / (TP + FP)`.
- AC-55 (US-4): The eval scorer shall compute `citation_accuracy` as surviving
  findings divided by surviving plus dropped findings, over all cases of the
  run.
- AC-56 (US-4): The eval scorer shall report on each Case result, as
  `unjudged`, the number of surviving findings that match no expectation;
  they enter neither `TP` nor `FP`.
- AC-57 (US-4): If a metric's denominator is 0, then the eval scorer shall
  return null for that metric.
- AC-58 (US-4): The eval scorer shall return the same case results and metrics
  whatever the findings' severity, category, title and confidence are.
- AC-59 (US-4): The eval scorer shall produce case results and metrics from
  the expectations, surviving findings and dropped findings alone, making zero
  calls to an LLM provider.
- AC-60 (US-4): While executing an eval run, the API shall call the LLM
  provider only inside the review engine's execution of a case
  (`reviewer-core/src/review/run.ts:186`).

### Metric tiles on the Evals tab

- AC-61 (US-4): The Evals tab shall show four tiles, Recall, Precision,
  Citation accuracy and Traces passed, holding the values of the agent's most
  recent completed run (`05`).
- AC-62 (US-4): While the agent has two or more completed runs, the Evals tab
  shall show on each of the three metric tiles the delta in points against the
  preceding completed run, with an up marker when it is positive, a down
  marker when it is negative, and as "0pt" with no marker when it is zero.
- AC-63 (US-4): While the agent has no completed run, the Evals tab shall show
  "—" in all four tiles and no delta.
- AC-64 (US-4): While a metric of the shown run is null, every surface that
  shows it shall render "—" with no bar and no delta.
- AC-65 (US-5): When the user activates "View full dashboard" on the Evals
  tab, the client shall open that agent's view on the Eval Dashboard.

### Eval Dashboard: all agents

- AC-66 (US-5): The sidebar shall show an "Eval Dashboard" entry in the Skills
  Lab group after Conventions, which opens `/eval` (`02`;
  `client/src/vendor/ui/nav.ts:33-43`).
- AC-67 (US-5): The Eval Dashboard shall list each agent that has at least one
  case or one run, with its name, its model, and for its most recent completed
  run the version, the run time, "P/T pass" and the three metrics.
- AC-68 (US-5): The Eval Dashboard shall draw for each listed agent a
  sparkline of `recall` over its 8 most recent completed runs, oldest first.
- AC-69 (US-5): While a listed agent has no completed run, the Eval Dashboard
  shall show "No runs yet" on its row, "—" for its metrics and no sparkline.
- AC-70 (US-5): When the user activates an agent's row, the client shall open
  that agent's view at a URL under `/eval` that identifies the agent.
- AC-71 (US-5): The Eval Dashboard shall show a "Recent eval runs · all
  agents" table of the 10 most recent runs across existing agents, newest
  first, each with the agent's name, run time, version, the three metrics as a
  bar with a percentage, and passed over total.
- AC-72 (US-5): While a run in a run table, including the Evals tab's "Recent
  runs" list, has status `running` or `failed`, the table shall show that
  status in place of the metric bars.
- AC-73 (US-5): While no agent has a case or a run, the Eval Dashboard shall
  show an empty state saying that cases are created from accepted or dismissed
  findings on a pull request.
- AC-74 (US-5): While the dashboard data is loading, the Eval Dashboard shall
  show a skeleton.
- AC-75 (US-5): If the dashboard request fails, then the Eval Dashboard shall
  show an error state with a retry control.

### Eval Dashboard: agent view

- AC-76 (US-5): The agent view shall show the agent's name, its model, the
  number of its runs, the current number of its cases, a link back to all
  agents, and a "Run eval" control (`03`).
- AC-77 (US-5): The agent view shall show three metric cards, Recall,
  Precision and Citation accuracy, each with the most recent completed run's
  value, the delta in points against the preceding completed run (shown as
  "0pt" with no up or down marker when it is zero), and a sparkline of that
  metric.
- AC-78 (US-5): While the agent has two or more completed runs, the agent view
  shall show a "Metric trend" chart with one series per metric over the
  agent's 20 most recent completed runs, oldest first, and a legend naming the
  three series.
- AC-79 (US-5): While the agent has fewer than two completed runs, the agent
  view shall show a text placeholder in place of the trend chart.
- AC-80 (US-5): While a completed run's metric is null, the trend chart and
  the sparklines shall omit that run's point from that metric's series.
- AC-81 (US-5): The agent view shall show a "Recent runs" table of the agent's
  20 most recent runs, newest first, with the columns Ran at, Version, Recall,
  Precision, Citation, Pass and Cost.
- AC-82 (US-5): While a run's `cost_usd` is null, every surface that shows its
  cost shall render "—".
- AC-83 (US-5): If the URL names an agent that does not exist, or carries an
  id that is not a valid identifier, then the agent view shall show a
  not-found state with a link back to all agents.
- AC-84 (US-5): The Evals tab shall show a "Recent runs" list of the agent's 5
  most recent runs, newest first, with the columns Ran at, Version, Recall,
  Precision, Citation, Pass and Cost, and with no selection checkbox and no
  Compare control (D12).

### Comparing two runs

- AC-85 (US-6): The agent view shall offer a selection checkbox on each
  completed run's row and none on a `running` or `failed` row.
- AC-86 (US-6): The agent view shall show the number of selected runs as
  "N selected" beside the table heading (`03`).
- AC-87 (US-6): While the number of selected runs is other than two, the
  agent view shall render the Compare control disabled.
- AC-88 (US-6): While two runs are selected, the agent view shall render the
  checkboxes of the other rows disabled.
- AC-89 (US-6): When the user activates Compare, the agent view shall open a
  Compare modal titled with the two runs' versions as "vA → vB", where A is
  the run with the earlier `ran_at` (`04`).
- AC-90 (US-6): The Compare modal shall show a tile for each of Recall,
  Precision and Citation with the older run's value, the newer run's value
  and the delta in points, with an up marker when it is positive, a down
  marker when it is negative, and as "0pt" with no marker when it is zero.
- AC-91 (US-6): The Compare modal shall show a Cost tile with the older run's
  cost, the newer run's cost and their difference in USD.
- AC-92 (US-6): While either run's value for a tile is null, the Compare modal
  shall show "—" for that value and no delta on that tile.
- AC-93 (US-6): The Compare modal shall show a line-by-line diff of the two
  runs' stored system prompts, marking lines present only in the older prompt
  as removed and lines present only in the newer prompt as added, under a
  legend naming the two versions.
- AC-94 (US-6): While the two stored system prompts are identical, the Compare
  modal shall show the text "System prompt unchanged" in place of the diff.
- AC-95 (US-6): While the two runs' stored models differ, the Compare modal
  shall show both model ids, older first.
- AC-96 (US-6): The Compare modal shall show `traces_passed` over
  `traces_total` for each of the two runs.
- AC-97 (US-6): The Compare modal shall offer Close as its only footer action.
- AC-98 (US-6): When the user closes the Compare modal, the agent view shall
  keep the two runs selected.
- AC-99 (US-6): When the agent's system prompt is edited after a run, the API
  shall return that run's stored `system_prompt`, `model` and `agent_version`
  unchanged.

### Seed, browser flow and verification

The existing seed rows cannot carry this fixture: the #482 sample review is
inserted with no agent (`server/src/db/seed.ts:181-192`), no seeded finding
is decided (`seed.ts:194-219`), and no built-in agent has two versions. The
fixture is therefore a dedicated seeded agent, which the plan names "Eval
Demo Reviewer" and seeds disabled, so that General Reviewer stays the user's
own experiment (D9).

- AC-100 (US-7): The demo seed shall give one dedicated seeded agent, "Eval
  Demo Reviewer", seeded disabled, at least one `must_find` case, at least
  one `must_not_flag` case and two completed runs whose `agent_version` and
  `system_prompt` differ.
- AC-101 (US-7): The demo seed shall leave one finding of the #482 sample
  review accepted, with no eval case and on a review that has an agent,
  without changing any finding the user has already accepted or dismissed.
- AC-102 (US-7): The demo seed's stored metrics and case results for each
  seeded run shall equal what the eval scorer returns for that run's seeded
  findings.
- AC-103 (US-7): The demo seed's every case expectation shall survive the
  grounding gate against that case's `input_diff`.
- AC-104 (US-7): The e2e suite shall include a flow that opens a seeded
  agent's Evals tab and waits for a seeded case and the four metric tiles,
  sending no request that starts a run.
- AC-105 (US-7): The e2e suite shall include a flow that opens the Eval
  Dashboard, opens the seeded agent's view, selects the two seeded runs and
  waits for the Compare modal's prompt diff.
- AC-106 (US-7): The e2e suite shall include a flow that turns the accepted
  finding of the #482 sample review (AC-101) into a case and waits for the
  control's "created" state.
- AC-107 (US-7): The `verify:l06` script, run as `pnpm verify:l06` in
  `server/` on a machine where Docker is available, shall exit 0 on a checkout
  that has no LLM API key configured and no network route to an LLM provider
  (D15).
- AC-108 (US-7): If the eval scorer returns a wrong case result or metric for
  a `must_find` or a `must_not_flag` fixture, then the `verify:l06` script
  shall exit non-zero.
- AC-109 (US-7): If scoring calls an LLM provider, then the `verify:l06`
  script shall exit non-zero.
- AC-110 (US-7): If the check that drives `POST /agents/:id/eval-runs` end to
  end against a mocked LLM provider does not run, or runs without producing a
  completed run with the expected metrics, then the `verify:l06` script shall
  exit non-zero; a check skipped because Docker is unavailable counts as not
  run (D15).
- AC-111 (US-7): If the eval contracts and `FindingRecord` differ between
  `client/src/vendor/shared` and `server/src/vendor/shared`, then the
  `verify:l06` script shall exit non-zero.
- AC-112 (US-7): The `make verify-l06` target shall exit with the status of
  `pnpm verify:l06` run in `server/`.

### Stored-state invariants

- AC-113 (US-1): The API shall hold at most one eval case per finding.
- AC-114 (US-1, US-3): If the API rejects a case-creation request or a run
  request, then the API shall store no case and no run for it.

### Deleting a case

- AC-115 (US-2): The Evals tab shall show a delete control on each case row
  (`05`).
- AC-116 (US-2): When the user activates a row's delete control, the Evals tab
  shall show a confirmation that names the case and offers confirm and cancel
  actions, before any request is sent and without opening the case modal.
- AC-117 (US-2): When the user confirms the deletion, the API shall remove the
  case from the agent's set.
- AC-118 (US-2): When the user cancels the confirmation, the Evals tab shall
  keep the row, having sent no delete request.
- AC-119 (US-2): When a deletion succeeds, the Evals tab shall remove the
  case's row without a page reload.
- AC-120 (US-2): When a case is deleted, the API shall leave every stored
  run's metrics, `traces_passed`, `traces_total`, `cost_usd` and Case results
  unchanged, including the deleted case's own results with their stored
  `case_id` and `case_name`.
- AC-121 (US-2): When a case is deleted, the API shall return `eval_case_id`
  null on the case's finding record.
- AC-122 (US-1): When a finding's case has been deleted, the finding card
  shall render the "Turn into eval case" control enabled, so that activating
  it creates a new case from the finding's current decision.
- AC-123 (US-2): While an eval run of the agent has status `running`, if a
  delete request names one of the agent's cases, then the API shall reject it
  with 409 `eval_run_in_progress`, keeping the case.
- AC-124 (US-2): While an eval run of the agent has status `running`, the
  Evals tab shall render the delete controls disabled.
- AC-125 (US-2): If a deletion fails, then the Evals tab shall show the API's
  error message, with the case's row still listed.
- AC-126 (US-2): If a delete request names a case that does not exist, then
  the API shall respond 404.

### Additions after the user's answers

- AC-127 (US-5): While the agent has no run, the Evals tab shall show the text
  "No runs yet" in place of the "Recent runs" list.
- AC-128 (US-6): While the set of `case_id` values in the older run's stored
  Case results differs from the set in the newer run's, the Compare modal
  shall show a notice saying that the two runs covered different case sets
  and that their metrics are not directly comparable, with the number of cases
  only in the older run and the number only in the newer run.
- AC-129 (US-4): While the review engine executes a case in a single pass and
  the model's first output is valid, the API shall make exactly one LLM
  provider call for that case.

Note to AC-129: a case's fragment holds one file, and the engine selects
map-reduce only for a diff of more than one file, so a one-file fragment
under the map-reduce threshold runs single-pass, as it does under every
strategy (`reviewer-core/src/review/run.ts:126-132`). What can raise the count
above one is a retry of invalid output.

## Edge cases

| Case | Expected behaviour | Ref |
|---|---|---|
| Finding not triaged | Control disabled with an explanation; the API refuses and stores nothing | AC-2, AC-13, AC-114 |
| Control activated twice, or from a stale tab | One case; the second request returns it | AC-12, AC-113 |
| The agent that produced the finding was deleted (`reviews.agent_id` is null) | Refused | AC-14 |
| The file has no stored patch (binary, or absent from `pr_files`) | Refused | AC-15 |
| The review ran on a live `git diff`, and the stored patch differs (`diff-loader.ts:19-29`): the finding's lines are outside the stored hunks | Refused; such a `must_find` could never pass and such a `must_not_flag` could never fail | AC-16 |
| A full-file finding kind (`secret_leak`, …) whose lines are outside the hunks | Accepted when the gate keeps it (`grounding.ts:66-70`) | AC-16 |
| Accepted finding later dismissed, after its case exists | Case keeps `must_find` and the control still shows "created"; the user deletes the case and creates it again, now as `must_not_flag` | AC-18, AC-117, AC-121, AC-122 |
| Case deleted, then two runs compared, one from before the deletion | Past runs keep their metrics and the deleted case's result; Compare shows the different-sets notice | AC-120, AC-128 |
| Delete requested while a run of the agent is `running` | Refused; delete controls disabled | AC-123, AC-124 |
| Delete control activated by mistake | Nothing is sent until the user confirms | AC-116, AC-118 |
| Delete sent twice, or for a case already gone | 404; the row is no longer listed | AC-126, AC-119 |
| Delete request fails | Error shown, row kept | AC-125 |
| Last case of the set deleted | Empty state; run controls disabled; tiles and "Recent runs" still show the stored runs | AC-26, AC-46, AC-61, AC-84 |
| PR re-imported, review deleted, finding gone | Case stays, `finding_id` null | AC-19 |
| Very large patch for the file | Stored whole | Non-goal (narrowing) |
| Two findings with the same title | Two cases with the same name; rows are told apart by file and expectation in the modal | AC-7, AC-29 |
| Very long case name | Row truncates it; the modal shows it whole | AC-21, AC-29 |
| Set has only `must_find` cases | `precision` has value when `TP > 0`; no `FP` is possible | AC-54, AC-57 |
| Set has only `must_not_flag` cases | `recall` is null, shown "—" | AC-57, AC-64 |
| Agent returns no finding on any case | `citation_accuracy` and `precision` null | AC-57 |
| Two surviving findings hit one `must_find` | Case passes; `TP` counts 2 | AC-51, AC-54 |
| A finding overlaps the expectation by one line | It matches | AC-50 |
| A finding with `start_line > end_line` | Range normalised before matching | AC-50 |
| Surviving finding elsewhere in the file | Counted as `unjudged`, not in `precision` | AC-56 |
| Run requested with zero cases | Refused, nothing stored; run control disabled | AC-43, AC-46, AC-114 |
| Second run requested while one runs | Refused, nothing stored; run control disabled | AC-44, AC-47, AC-114 |
| Case created while a run is in progress | Not part of that run | AC-35 |
| Provider key missing, provider error, or model output invalid after the engine's retries | Run `failed`, no metrics, error shown | AC-41, AC-42, AC-49 |
| API process stops mid-run | Run becomes `failed` on next start | AC-45 |
| Unknown model, no price | `cost_usd` null, shown "—" | AC-40, AC-82 |
| Agent deleted | Deleting an agent deletes its cases, its runs and their case results; nothing of it is listed anywhere | AC-67, AC-71, AC-83 |
| Prompt, model or provider edited while a run is in progress | The run executes, and later shows, the values stored at its creation | AC-34, AC-36, AC-99 |
| Delta of exactly zero | "0pt" with no up or down marker | AC-62, AC-77, AC-90 |
| Agent view URL with an id that is not a valid identifier | Not-found state, the same as an unknown id | AC-83 |
| Agent has cases but no run | Listed with "No runs yet"; tiles show "—" | AC-63, AC-69 |
| One completed run | No deltas; trend placeholder; Compare disabled | AC-62, AC-79, AC-87 |
| Fewer or more than two runs selected | Compare disabled; a third cannot be selected | AC-87, AC-88 |
| Runs selected in any order | Older run is always on the left | AC-89 |
| Two runs of one version (model or skill changed, or a repeat) | Title "vN → vN"; "System prompt unchanged" | AC-89, AC-94 |
| A linked skill's body edited between runs: `agents.version` does not change (skills carry their own version, `knowledge.ts:129`) | Stated limitation: a run stores no skills, so the change is not visible in Compare and two runs with identical title and prompt can differ | Non-goal (D13) |
| Cases added or deleted between two compared runs | Notice that the runs covered different case sets, with the counts; each run's passed over total is shown | AC-128, AC-96 |
| Two runs with the same number of cases but different cases | Notice shown: the comparison is of `case_id` sets, not of totals | AC-128 |
| Model changed between runs | Both model ids shown | AC-95 |
| Prompt edited after a run | The run keeps its stored prompt | AC-99 |
| Screenshot texts and fixture strings | Not quoted into criteria or e2e waits; they do not describe the seeded diffs (`.context/insights/INSIGHTS.md`, 2026-10-03) | AC-102, AC-103 |
| Course page says the Evals tab holds run history; `05` draws only tiles and a link | Both: the tiles, the link and a 5-row "Recent runs" list without selection | AC-84, AC-127, AC-65 |
| Agent's strategy is `map-reduce` or `auto` | A one-file fragment still runs single-pass (`reviewer-core/src/review/run.ts:126-132`) | AC-129 |
| The model's first output is invalid | The engine retries, so a case may take more than one provider call; every call stays inside the engine's execution | AC-60, AC-129 |
| `03` draws card deltas as fractions; `04` and `05` draw points | Points everywhere | AC-62, AC-77, AC-90 |
| Docker absent when `verify:l06` runs | The run-route check cannot run, so the script exits non-zero; it never reports green on a skipped check | AC-107, AC-110 |

## Non-functional requirements

- NFR-1. Every eval route shall resolve ids within the caller's workspace and
  respond 404 for an id of another workspace, as
  `server/src/modules/reviews/findings.ts:17-20` does.
- NFR-2. `POST /agents/:id/eval-runs` shall be limited to 10 requests per
  minute, the limit of `POST /pulls/:id/review`
  (`server/src/modules/reviews/routes.ts:40`).
- NFR-3. Every new route shall declare a response schema built from a
  `@devdigest/shared` contract (`.context/insights/INSIGHTS.md`, Decisions,
  2026-09-20).
- NFR-4. Scoring, creating a case, deleting a case, listing cases, the
  dashboard, the agent view, the case modal and Compare shall make zero LLM
  calls. An eval run calls the provider only inside the review engine's
  execution of a case; how many calls one execution makes depends on the
  engine's mode and on its retries of invalid output, and is one for a
  single-pass execution with a valid first output (AC-129 and its note).
- NFR-5. Given the same expectations, surviving findings and dropped findings,
  the eval scorer shall return identical output on every call.
- NFR-6. A metric shall never be conveyed by colour alone: each value has a
  text label, and each delta a sign or arrow. The recall, precision and
  citation colours are `--accent`, `--ok` and `--warn`.
- NFR-7. The case modal and the Compare modal shall close on Escape.
- NFR-8. A normal PR review's prompt and the `get_findings` MCP tool's output
  shall be unchanged by this feature.

## Inputs and provenance

| Input | Provenance | Note |
|---|---|---|
| Finding: file, lines, title, severity, category, decision | `[reused: stored review finding]` | Read at case creation |
| PR stored patch, title, description | `[reused: imported PR data]` | Copied onto the case; `pr_files` has no stable order, key by path (`server/.context/insights/INSIGHTS.md`, 2026-09-23) |
| Agent system prompt, model, provider, version | `[deterministic: agents store]` | Read at run creation and stored on the run; every case executes the stored values |
| Agent strategy | `[deterministic: agents store]` | Read at run creation and passed to the engine; not stored on the run |
| Linked enabled skill bodies | `[reused: skills store]` | Part of the agent under test; resolved when the run's execution starts, not stored on the run |
| The agent's findings per case | `[new: 1 engine execution per case per run]` | The only model use in the feature: one provider call when single-pass with a valid first output, more under map-reduce or a retry |
| Surviving and dropped findings | `[deterministic: reviewer-core grounding gate]` | `reviewer-core/src/grounding.ts:52` |
| Case results and the three metrics | `[deterministic: eval scorer]` | No model |
| Cost | `[deterministic: price book]` | `server/src/adapters/llm/pricing.ts:37`; null for an unpriced model |
| Deltas, trend, sparkline | `[deterministic: stored runs]` | |
| System prompt diff | `[deterministic: text diff of two stored snapshots]` | |

## Untrusted inputs

- **Stored diff fragment** (`input_diff`): from a pull request. Data, never
  instructions. It reaches the prompt only through the engine's diff slot,
  which fences it (`reviewer-core` pipeline invariants), and is rendered in
  the case modal as plain text.
- **PR title and description** (`input_meta`): from the PR author. The
  description reaches the prompt only through the engine's PR-description
  slot, which wraps and truncates it
  (`server/src/modules/reviews/run-executor.ts:280-282`). The title shall not
  be placed in a prompt slot the engine treats as trusted. Both are rendered
  as plain text.
- **Finding title**: output of an earlier model call. It becomes the case name
  and the expectation's display title, is rendered as plain text and is never
  sent to a prompt.
- **Findings of an eval run**: model output. They are scored by file and line
  only, stored on the case result and rendered as plain text. Their text is
  never re-prompted.
- **System prompt snapshot**: written by the user. Rendered in Compare as
  plain text, never as HTML or Markdown.
- **Skill bodies**: enter the prompt under the trust rule a normal review
  applies (`run-executor.ts:204-208`); this feature does not change it.

## Definition of done and demo

Mapping of the course page's criteria:

| Course criterion | Covered by |
|---|---|
| The set has ≥ 8 cases | User step 2 below |
| A case is created from a finding in one click; both types work | AC-1 – AC-17, AC-113, AC-114 |
| Changing the system prompt visibly moves recall/precision between two runs | User steps 3–5; AC-34, AC-53, AC-54, AC-89 – AC-93 |
| Scoring makes no LLM call | AC-59, AC-60, AC-109 |
| `pnpm verify:l06` is green | AC-107 – AC-112 |

The course deadline is 2026-10-11 23:45. If the build has to be cut, the seed
and browser-flow criteria (AC-100 – AC-106) are the lowest-priority group and
go first: none of the five course criteria depends on them, and with them cut
step 7 below drops `make e2e`.

User steps, on the target agent General Reviewer (D9). They are not product
behaviour.

1. Triage. The local database held 130 findings on 2026-10-10, 4 of them
   decided (3 accepted, 1 dismissed) across six agents. Accept or dismiss
   General Reviewer findings until at least 8 are decided, with several
   dismissed.
2. Create at least 8 cases, at least one of each type. Precision can only fall
   through `must_not_flag` cases (D2), so the experiment needs more than one.
3. Run. Record the baseline.
4. Edit the system prompt, run again, open Compare on the two runs. Take the
   screenshot.
5. Break the prompt on purpose, run again, and confirm precision is lower than
   the baseline.
6. Record the screencast: case from a finding → run → metrics → second run
   with a changed prompt → Compare.
7. `pnpm verify:l06`, `make check` and `make e2e` are green.

## Open questions

None. The six questions this spec raised were answered by the user on
2026-10-10 and are recorded as D10–D15 under _Decisions_.
