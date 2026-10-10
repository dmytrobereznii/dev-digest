# Plan: Eval Pipeline
Spec: SPEC-13 — 2026-10-10-eval-pipeline.md
Status: ready

No open question. Decisions below are `Dn`; the spec's own are cited as
`spec-Dn` and `spec-Sn`. Criteria: 129 `AC-n` (AC-1 to AC-129, no gaps) and
8 `NFR-n`. Deadline 2026-10-11 23:45: §5 gives the cut order and the
boundary at which the feature can be demoed.

Short paths: `SH/` = `{server,client}/src/vendor/shared` (both copies),
`EV/` = `server/src/modules/eval`, `PR/` =
`client/src/app/repos/[repoId]/pulls/[number]`, `AE/` =
`client/src/app/agents/[id]/_components/AgentEditor`, `CE/` =
`client/src/components/eval`.

## 1. What already ships

| Layer | Fact | path:line |
|---|---|---|
| Engine | `reviewPullRequest` needs `systemPrompt`, `model`, `diff`, `llm`; the rest is optional | `reviewer-core/src/review/run.ts:45-104`, `:134` |
| Engine | The outcome carries kept findings, `dropped[]` and `costUsd` (null when any chunk is unpriced) | `run.ts:106-124`, `:196` |
| Engine | A one-file diff always runs single-pass, whatever the strategy; one `completeStructured` per chunk | `run.ts:126-132`, `:186` |
| Engine | `groundFindings`; full-file kinds only need the file in the diff; both are exported | `reviewer-core/src/grounding.ts:16`, `:52`, `:66-70`; `reviewer-core/src/index.ts:26`, `:42` |
| Server | `parseUnifiedDiff` opens a file on `+++ ` alone, so `--- a/p`, `+++ b/p`, patch parses without a `diff --git` line | `server/src/adapters/git/diff-parser.ts:14`, `:39-45` |
| Server | The stored-patch diff is built per file from `pr_files` | `server/src/modules/reviews/diff-loader.ts:33-44` |
| Server | A normal review resolves linked enabled skills, passes `prDescription`, and puts the PR title in the task line | `server/src/modules/reviews/run-executor.ts:210-211`, `:240-248`, `:262-292`; `reviews/helpers.ts` (`taskLine`) |
| Server | Finding actions are workspace-scoped through `findingContext`; `findingRowToDto` builds every `FindingRecord` | `server/src/modules/reviews/findings.ts:11-34`; `reviews/helpers.ts` (`findingRowToDto`); `reviews/repository/review.repo.ts` (`reviewsForPull`, `findingContext`) |
| Server | Review runs are created `running`, executed fire-and-forget, limited to 10 per minute | `server/src/modules/reviews/service.ts:103-138`; `reviews/routes.ts:40` |
| Server | Agent read, version bump on config change, linked skills | `server/src/modules/agents/repository.ts:65-71`, `:112-146`, `:192-200` |
| Server | Module registry; repositories on the container; `container.llm(id)` with `overrides.llm` | `server/src/modules/index.ts:31-47`; `server/src/platform/container.ts:57`, `:113-131`, `:232-240` |
| Server | Boot reaper for review runs; the rate-limit plugin is off under `NODE_ENV=test` | `server/src/app.ts:80-85`, `:95-97` |
| Server | Response-schema helpers `IdParams`, `ApiErrors`, `NotFound`, `OkResponse`; `AppError(code, message, status)` | `server/src/modules/_shared/schemas.ts:12`, `:26-37`; `server/src/platform/errors.ts:7-17` |
| Server | A route may not import a repository; a module file outside `repository` that imports `db/` is a warning | `server/.dependency-cruiser.cjs:88-94`, `:98-107` |
| DB | `eval_cases`, `eval_runs` (per-case shape, `case_id NOT NULL`); re-exported by the schema barrel; latest migration `0016_salty_pyro` | `server/src/db/schema/eval.ts:7-35`; `server/src/db/schema.ts:37`, `:75-76`; `server/src/db/migrations/meta/_journal.json` |
| DB | `reviews.agent_id` is nullable (`set null`); `findings` holds the decision timestamps | `server/src/db/schema/reviews.ts:23`, `:56-57` |
| Contract | Dormant `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`, `EvalCase`; dormant `EvalCaseInput` … `EvalDashboard`; `FindingRecord` | `server/src/vendor/shared/contracts/knowledge.ts:50-84`; `contracts/eval-ci.ts:3`, `:20-89`; `contracts/review-api.ts:15-20` |
| Contract | The barrel is `export *` per file; `knowledge.ts` and `eval-ci.ts` already differ between the copies, `review-api.ts`, `findings.ts` and `index.ts` do not | `server/src/vendor/shared/index.ts:17-28`; `diff -rq client/src/vendor/shared server/src/vendor/shared` |
| Test | The only reader of a dormant eval contract; the cross-copy identity precedent | `server/test/contracts.test.ts:179-190`, `:378-390` |
| Test | Docker gate and container fixture; app built on the fixture DB with mock LLM | `server/test/helpers/pg.ts:23-53`; `server/test/reviews.it.test.ts:12-15`, `:113-124` |
| Test | `MockLLMProvider` records every call and prices each at 0.001 | `server/src/adapters/mocks.ts:66-113` |
| Test | The unit lane builds the app with no fixture DB, so the boot reaper runs against `DATABASE_URL` | `server/test/routes-smoke.test.ts:14-16` |
| Tooling | No `verify:*` script; `tsc` covers `src/` only; vitest collects `test/**/*.test.ts` and `src/**/*.test.ts` | `server/package.json:6-14`; `server/tsconfig.json`; `server/vitest.config.ts` |
| Tooling | `make test`, `make test-it`, `make check` | `Makefile:45`, `:48-55` |
| Seed | The #482 sample review has no agent and neither finding is decided; built-in agents are inserted at version 1 with no `agent_versions` row | `server/src/db/seed.ts:181-192`, `:194-219`, `:244-285` |
| Seed | Hunk headers of the four seeded patches | `server/src/db/seed-diffs.ts:23`, `:113`, `:161`, `:172` |
| Client | The action row renders only while the card is expanded; two render sites | `PR/_components/FindingCard/FindingCard.tsx:77`, `:91-112`; `FindingsPanel/FindingsPanel.tsx:101-111`; `DiffTab/DiffTab.tsx:105-113` |
| Client | `useFindingAction` invalidates `["reviews", prId]`; every mutation error also toasts | `client/src/lib/hooks/reviews.ts:162-188`; `client/src/lib/providers.tsx:41-43` |
| Client | Editor tabs and the tab whitelist | `AE/constants.ts:11-15`; `AE/AgentEditor.tsx:25-27`; `client/src/app/agents/[id]/page.tsx:16`, `:31` |
| Client | Nav group; `/eval` already maps to key `eval`; `Gauge` icon exists | `client/src/vendor/ui/nav.ts:33-43`; `client/src/components/app-shell/helpers.ts:35`; `client/src/vendor/ui/icons.tsx:58` |
| Client | `eval.json` has no reader and is not in `USED_NAMESPACES`; test messages export four namespaces | `client/messages/en/eval.json`; `client/src/app/layout.tsx:21-34`; `client/src/test/messages.ts:9-12` |
| Kit | `Modal` has no key handler; `Checkbox` has no `disabled`; `LineChart` turns a missing point into 0; `Sparkline` divides by `length - 1`; `MetricCard` prints the delta with two decimals | `client/src/vendor/ui/kit/Modal.tsx:4-18`; `kit/Checkbox.tsx:5-13`; `charts/LineChart.tsx:35`; `charts/Sparkline.tsx:19`; `charts/MetricCard.tsx:65` |
| MCP | `ApiFinding` is a plain `z.object`, so an added field is stripped | `mcp/src/api/schemas.ts:87-99` |
| E2E | Flows 01 to 14; the seed contract table | `e2e/specs/`; `e2e/.context/docs/seed-contract.md` |
| Design | Nav entry, Evals tab, case row, case editor, dashboard screen | `.context/docs/design/src/chrome.jsx:13`; `screen_agents.jsx:135-143`; `components2.jsx:43-58`; `screen_cizruns.jsx:56-60`; `screen_skills.jsx:280` |

Design greps: component grep (`EvalDashboard|EvalCase|EvalsTab|EvalRun`) 4
files; feature grep (`eval`) 8 files, of which `data.jsx` and `data2.jsx` are
fixtures and `screen_settings.jsx` only names eval cases in plugin-export
copy. Five surfaces in the extraction (nav entry, Evals tab, case row, case
editor, dashboard), placed on the canvas at `canvas/canvas.jsx:84-85`,
`:93-94`. The finding-card control, the all-agents list, Compare and the run
selection exist only in `.context/docs/l06-eval-screens/01` to `06`.

## 2. Decisions

### D1 — Eval contracts live in a new `contracts/eval.ts`; the dormant shapes go
One file, byte-identical in both copies, exported from both barrels. It holds
`EvalOwnerKind` (moved), `EvalExpectationType`, `EvalExpectation`,
`EvalRunFinding`, `EvalCaseResult`, `EvalCase`, `EvalRunStatus`, `EvalRun`,
`EvalRunSummary` (= `EvalRun` without `system_prompt`), `EvalRunDetail`
(= `EvalRun` + `results`), `EvalTrendPoint`, `AgentEvalOverview`,
`EvalDashboardAgent`, `EvalDashboard`, `CreateEvalCaseRequest`. It imports
`Severity`, `FindingCategory` from `./findings.js` and `Provider` from
`./knowledge.js`. The dormant `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`,
`EvalCase` leave `knowledge.ts` and `EvalCaseInput`, `EvalRunRecord`,
`EvalRunResult`, `EvalTrendPoint`, `EvalDashboard` leave `eval-ci.ts`, in
both copies. `duration_ms` and `traces_passed` are nullable (unknown while a
run is `running` or `failed`); `traces_total` is the set size at creation.
*Why:* `export *` cannot carry two `EvalRun`; `knowledge.ts` and `eval-ci.ts`
carry accepted drift, so only a new file makes AC-111 a byte comparison.
*Rejected:* reshaping in place (the identity check becomes a slice
comparison); new names beside the dormant ones (two `EvalRun`-like shapes).
Serves: AC-9, AC-111, NFR-3.

### D2 — Three tables, dropped and recreated by two generated migrations
`eval_cases(id, workspace_id, agent_id → agents CASCADE, name, finding_id →
findings SET NULL, expectation_type, file, start_line, end_line, title,
severity, category, input_diff, pr_title, pr_description NULL, created_at)`
with `UNIQUE (finding_id)` and an index on `agent_id`.
`eval_runs(id, workspace_id, agent_id → agents CASCADE, status, ran_at,
duration_ms NULL, agent_version, system_prompt, model, provider, recall,
precision, citation_accuracy, traces_passed NULL, traces_total, cost_usd
NULL, error NULL)` with index `(agent_id, ran_at)` and the partial unique
index `eval_runs_one_running (agent_id) WHERE status = 'running'`.
`eval_case_results(run_id → eval_runs CASCADE, case_id, case_name,
expectation_type, pass, matched, unjudged, kept, dropped, findings jsonb,
duration_ms, cost_usd NULL)`, primary key `(run_id, case_id)`, index on
`case_id`. `case_id` has no foreign key on purpose (spec-S9). The API maps
`agent_id` to `owner_kind: 'agent'` + `owner_id`, the expectation columns to
`expected_output`, and the two PR columns to `input_meta`.
Migration: step 1 removes both tables from the schema and runs
`pnpm db:generate` (drops only); step 2 adds the three definitions and runs
it again (creates only).
*Why:* postgresql-table-design → *Constraints* (FK with an explicit action,
index the referencing column), *Unique + NULLs* (many null `finding_id` rows
must coexist, so not `NULLS NOT DISTINCT`), *Partial* index for spec-S2,
*JSONB* only for the variable-length findings list. drizzle-kit prompts for
a rename only when one generate both creates and drops (confirmed in
`drizzle-kit/src/cli/commands/migrate.ts`: the conflict prompts return early
when either list is empty), and an agent has no TTY to answer. Both tables
are empty and nothing writes them, so no data is lost (spec-D6).
*Rejected:* one generate with in-place `ALTER` (interactive rename prompts);
keeping `owner_kind`/`owner_id` with no FK (orphans after an agent is
deleted, and a finding that says "created" for a case nobody can list);
`jsonb expected_output` (scoring reads four typed fields); a `CHECK` on
`status` (same call as `agent_runs`, server `INSIGHTS.md` 2026-09-20);
`NUMERIC` cost (`agent_runs.cost_usd` is a float estimate).
Serves: AC-3, AC-19, AC-38, AC-44, AC-113, AC-120.

### D3 — Module `modules/eval`, dependencies injected as ports
`routes.ts`, `service.ts`, `run-executor.ts`, `repository.ts`, `scoring.ts`,
`helpers.ts`, `constants.ts`. `EvalService` takes
`{ repo, agents, reviews, llm }` typed from `Container['evalRepo']`,
`['agentsRepo']`, `['reviewRepo']` and `Container['llm']`; `routes.ts` builds
it from `app.container`. The repository does its own row → contract mapping
and imports nothing from `helpers.ts`.
*Why:* onion-architecture → *Dependency injection* (take the ports, not the
`Container`) and *Drizzle* (a repository returns DTO shapes). That shape
adds no `no-circular` and no `persistence-in-service` warning; one
`no-circular` of the `agents` kind is the tolerated ceiling.
*Rejected:* mirroring `agents/helpers ↔ repository` (a ninth cycle);
building the repository in `routes.ts` (`routes-skip-service` is an error).
Serves: AC-3, AC-33, NFR-1.

### D4 — Routes
| Route | Success | Errors |
|---|---|---|
| `POST /findings/:id/eval-case` | 201 `EvalCase`; 200 `EvalCase` when it exists | 404, 409 ×4 |
| `GET /agents/:id/evals` | 200 `AgentEvalOverview` | 404 |
| `DELETE /eval-cases/:id` | 200 `OkResponse` | 404, 409 |
| `POST /agents/:id/eval-runs` | 201 `EvalRunSummary`, 10 per minute | 404, 409 ×2 |
| `GET /eval-runs/:id` | 200 `EvalRunDetail` | 404 |
| `GET /eval/dashboard` | 200 `EvalDashboard` | — |

Each declares `response:` with `ApiErrors` and a module-local
`{ 409: ApiErrorBody }` where listed (root `INSIGHTS.md`, Decisions,
2026-09-20). Serves: AC-12, AC-33, AC-126, NFR-1, NFR-2, NFR-3.

### D5 — Case creation: checks in a fixed order, idempotent by the unique index
`findingContext` (404 outside the workspace) → existing case by `finding_id`
(return it) → decision (`finding_undecided`) → `review.agentId`
(`finding_agent_missing`) → the `pr_files` row matched by `path`
(`diff_unavailable`) → `groundFindings([finding], parseUnifiedDiff(fragment))`
(`finding_outside_stored_diff`) → `INSERT … ON CONFLICT (finding_id) DO
NOTHING`, then read. No code path updates a case.
*Why:* `pr_files` has no order (server `INSIGHTS.md`, 2026-09-23); the
conflict clause makes a double click race-free.
Serves: AC-3 to AC-8, AC-12 to AC-19, AC-113, AC-114.

### D6 — `eval_case_id` is derived, never stored on the finding
`reviews/repository/review.repo.ts` gains `evalCaseIdsByFinding(ids)`;
`findingRowToDto(row, evalCaseId = null)`; `reviewToDto` and `actOnFinding`
pass the looked-up id.
*Why:* one source of truth (the unique index), so deleting a case clears the
field with no second write. *Rejected:* a `findings.eval_case_id` column.
Serves: AC-9, AC-121, AC-122.

### D7 — The scorer is one pure file, `EV/scoring.ts`
`matches(f, e)`, `scoreCase(e, kept, droppedCount)`,
`scoreRun(cases) → { results, metrics }`. Its only import is
`@devdigest/shared` types.
*Rejected:* `reviewer-core` (spec keeps the engine unchanged).
Serves: AC-50 to AC-59, NFR-5.

### D8 — A run executes the snapshot taken at creation, case by case
Creation, in one transaction: read the agent, read the case set (empty →
`no_eval_cases`), insert the run with version, prompt, model, provider and
`traces_total` (unique violation → `eval_run_in_progress`). Execution is
fire-and-forget, as review runs are. Skills are resolved once when it
starts. Cases run sequentially in `created_at, id` order through
`reviewPullRequest` with `systemPrompt`, `model`, `strategy`, `skills`,
`llm`, `diff = parseUnifiedDiff(input_diff)`, `prDescription` and the
constant `EVAL_TASK_LINE` (the review task rule without title or author).
No `repoMap`, `callers`, `intent`, `specs`, `memory`. Results stay in memory;
completion writes them and the metrics in one transaction, keyed by run id.
The first failure stops the loop and stores `failed` with
`Case "<name>": <message>` cut at 500 characters.
*Why:* a stored prompt that differs from the executed one would make Compare
lie (AC-34 against AC-36); sequential order makes AC-42 hold by
construction; one closing transaction is spec-S3.
*Rejected:* a bounded pool (faster for 8 cases, but AC-41's named case and
AC-42 need cancellation logic); re-reading the agent per case.
Serves: AC-34 to AC-42, AC-60, AC-129, NFR-4.

### D9 — The boot reaper is one repository call in `app.ts`
`container.evalRepo.failRunningRuns(EVAL_RUN_INTERRUPTED)` inside the
existing `try`. Serves: AC-45.

### D10 — One overview payload per agent; the prompt travels only on run detail
`AgentEvalOverview = { agent, cases (with last_result), cases_total, runs (20
newest, any status), runs_total, trend (20 newest completed, oldest first) }`.
Last results come from `selectDistinctOn(case_id)` over completed runs.
`EvalDashboard = { agents, recent_runs (10) }`; an agent row carries its
newest completed run and `recall_trend` (8, oldest first, nulls kept).
*Why:* one polled query refreshes tiles, rows and tables together (AC-48);
40 prompts per poll would not.
Serves: AC-23, AC-61, AC-67, AC-68, AC-71, AC-76, AC-78, AC-81, AC-84, AC-99.

### D11 — `verify:l06` is a `tsx` runner that reads vitest's JSON report
`server/test/verify/l06.ts` spawns `vitest run` on
`src/modules/eval/scoring.test.ts`, `test/eval-contracts.test.ts` and
`test/eval-runs.it.test.ts` with `--reporter=default --reporter=json`, the
three provider keys removed from the child's environment. The pure
`evaluateReport` (`server/test/verify/report.ts`) passes only when each
required file is present with at least one passed test and no test in any
other state.
*Why:* an integration file self-skips without Docker and vitest then exits
0; only the report shows "skipped" (spec-D15).
*Rejected:* an env flag that un-skips the suite (needs `cross-env`); a
second vitest config.
Serves: AC-107 to AC-112.

### D12 — Client data: one hook file, polling at 2 s while a run is `running`
`client/src/lib/hooks/evals.ts`: `useAgentEvals`, `useEvalDashboard`,
`useEvalRun`, `useRunEvals`, `useCreateEvalCase`, `useDeleteEvalCase`. Keys
`["agent-evals", agentId]`, `["eval-dashboard"]`, `["eval-run", id]`.
Mutations invalidate the overview, the dashboard and the `["reviews"]`
prefix. Imported directly, off the aggregating barrel
(frontend-architecture → *Naming, imports and barrels*).
Serves: AC-11, AC-32, AC-48, AC-119.

### D13 — Shared eval UI sits at rung 2; the kit gains nothing but a one-point fix
`CE/` holds `helpers.ts`, `constants.ts`, `MetricTile`, `RunsTable`
(`runs`, optional `leading` cell renderer, `showCost`), each used by the
Evals tab and the `/eval` routes (frontend-architecture → *The rule*).
`RunsTable` draws a native `<input type="checkbox">` with a per-run
accessible name `Select run v<version> · <ran at>`. Modals close on Escape
through a local key listener in each modal. `Sparkline` is fixed to draw a
single point as a dot.
*Why:* `MetricCard`, `Checkbox`, `Modal` and `LineChart` each miss one thing
a criterion needs (§1), and a domain component may not enter `@devdigest/ui`
(frontend-architecture → *Styling and the design system*).
*Rejected:* widening four kit components for one feature.
Serves: AC-64, AC-68, AC-72, AC-84, AC-88, NFR-6, NFR-7.

### D14 — The finding control is a self-contained child of `FindingCard`
`FindingCard/_components/EvalCaseControl` takes the finding, owns
`useCreateEvalCase` and its inline error, and renders one button in three
states. Disabled: `aria-describedby` points at the visible explanation.
Created: `aria-disabled`, no handler.
*Why:* both render sites get it with no new `FindingCard` prop
(frontend-architecture → *Components*, the seven-prop budget).
Serves: AC-1, AC-2, AC-10, AC-11, AC-17, AC-122.

### D15 — The prompt diff is an in-repo line diff
`diffLines(older, newer)` in `CompareModal/helpers.ts`: longest common
subsequence over lines, output `same | removed | added` in order.
*Why:* prompts are tens of lines, AC-93 asks for line granularity only, and
a dependency means `pnpm add` relinking `client/node_modules` under the
parallel slices' test runs. *Rejected:* the `diff` package.
Serves: AC-93, AC-94.

### D16 — The trend chart is a local inline-SVG component
`TrendChart` under the agent view: one polyline per metric, y from 0 to 100,
a text legend, null points skipped.
*Why:* AC-80, and Recharts' `ResponsiveContainer` renders nothing at jsdom's
zero width. Serves: AC-78, AC-79, AC-80.

### D17 — Copy: three files, written once by slice F
`prReview.json` → `finding.evalCase.*`; `agents.json` →
`editor.tabs.evals`; `eval.json` rewritten whole (it has no reader) with
blocks `metrics`, `runs`, `evalsTab`, `caseModal`, `deleteCase`,
`dashboard`, `agentView`, `compare`. Strings the spec quotes are used as
quoted. Strings it describes without quoting:

| Key | Text |
|---|---|
| `finding.evalCase.created` | Eval case created |
| `finding.evalCase.needsDecision` | Accept or dismiss this finding first to turn it into an eval case. |
| `eval.evalsTab.empty`, `eval.dashboard.empty` | No eval cases yet. Cases are created from accepted or dismissed findings on a pull request. |
| `eval.deleteCase.title` / `body` | Delete eval case {name}? / Past runs keep this case's results. |
| `eval.agentView.notFound` | This agent does not exist. |
| `eval.agentView.trendPlaceholder` | The trend appears after two completed runs. |
| `eval.compare.caseSetNotice` | These runs covered different case sets, so their metrics are not directly comparable: {onlyOlder} only in {older}, {onlyNewer} only in {newer}. |
| `eval.metrics.delta` | ▲ {n}pt / ▼ {n}pt / 0pt (no arrow at zero) |
| `EVAL_RUN_INTERRUPTED` (server) | Eval run was interrupted by an API restart. |

Serves: AC-2, AC-26, AC-45, AC-73, AC-79, AC-83, AC-116, AC-128.

### D18 — One rounding rule, in `CE/helpers.ts`
`toPct` rounds half up on the decimal value, guarded against binary error
(0.825 → 83); `pointDelta` subtracts two `toPct` results (spec-S5); every
surface formats through them. Serves: AC-62, AC-64, AC-77, AC-90.

### D19 — The seed fixture lives on its own agent
`db/seed-evals.ts` writes, only when the agent is absent, a disabled agent
"Eval Demo Reviewer" at version 2 with `agent_versions` rows 1 and 2, one
`must_find` case linked to the seeded N+1 finding, one `must_not_flag` case
on `src/api/public/webhooks.ts` with no finding, and two completed runs (v1
and v2, prompts differing by one line) whose results are `scoreRun` of the
fixture's findings. Separately and idempotently it sets `agent_id` on the
#482 sample review when null and accepts its two findings when undecided,
leaving the Stripe finding without a case.
*Why:* General Reviewer is the user's experiment (spec-D9) and the seed runs
on every `make dev`; no built-in agent has two versions; the sample review
has no agent (§1). Skills are seeded with a version history the same way
(`seed.ts:292-322`).
*Rejected:* bumping Security Reviewer's version; a new review on #482 (it
becomes the default-open accordion and breaks flow 04).
Serves: AC-100 to AC-103.

### D20 — Three flows, numbered 15 to 17, ordered so none feeds another
15 reads the Evals tab, 16 runs Compare, 17 creates a case last. Checkbox
steps use the accessible names of D13. Serves: AC-104, AC-105, AC-106.

## 3. Tasks

Test IDs are a file prefix plus a number; titles are quoted for grep.

### 3.1 Slice A — Contracts, both copies
Files: `SH/contracts/eval.ts` (new), `SH/contracts/knowledge.ts`,
`SH/contracts/eval-ci.ts`, `SH/contracts/review-api.ts`, `SH/index.ts`,
`server/test/contracts.test.ts`, `server/test/eval-contracts.test.ts` (new),
`server/src/modules/reviews/helpers.ts`,
`PR/_components/FindingCard/FindingCard.test.tsx` and any other typed
`FindingRecord` literal `make typecheck` reports. Depends on: nothing.

- [x] T1 every shape of D1 in `contracts/eval.ts`, identical in both copies → AC-3, AC-33, AC-38, NFR-3 → K1 to K4
- [x] T2 `FindingRecord.eval_case_id`; `findingRowToDto(row, evalCaseId = null)`; typed fixtures gain the field → AC-9 → K5
- [x] T3 remove the dormant shapes and the `eval-ci.ts` import of them; add the barrel line; drop the `EvalRun` parse at `contracts.test.ts:179-190` → AC-111, NFR-3 → C1, `make typecheck`
- [x] T4 identity assertion for `contracts/eval.ts`, `contracts/review-api.ts`, `index.ts` → AC-111 → C1

Tests — `server/test/contracts.test.ts`:
K1 "EvalExpectation accepts must_find and must_not_flag with a file and a line range, and rejects another type" ·
K2 "EvalCase parses with a null finding_id and a null last_result" ·
K3 "EvalRun accepts null metrics, cost, duration and error, and rejects a metric outside 0 to 1" ·
K4 "EvalCaseResult carries case_id, case_name, pass, matched, unjudged, kept, dropped and findings" ·
K5 "FindingRecord requires eval_case_id as a string or null".
`server/test/eval-contracts.test.ts`: C1 "contracts/eval.ts, contracts/review-api.ts and index.ts are byte-identical in both vendored copies".

### 3.2 Slice B — Schema and migrations
Files: `server/src/db/schema/eval.ts`, `server/src/db/schema.ts`,
`server/src/db/migrations/0017_*.sql`, `0018_*.sql`, `meta/_journal.json`,
`meta/0017_snapshot.json`, `meta/0018_snapshot.json` (all five written by
`pnpm db:generate` only), `server/test/eval-schema.it.test.ts`.
Depends on: nothing. If either generate asks a question, stop and return to
the parent; never answer by writing SQL.

- [x] T5 remove `evalCases` and `evalRuns` from the schema and the barrel; `pnpm db:generate` → AC-38, AC-113 → M1
- [x] T6 the three tables of D2 and the barrel exports; `pnpm db:generate` → AC-3, AC-19, AC-38, AC-44, AC-113, AC-120 → M1 to M6

Tests — `server/test/eval-schema.it.test.ts`:
M1 "the migrations apply on an empty database and leave eval_cases, eval_runs and eval_case_results" ·
M2 "eval_cases holds one row per finding_id and many rows with a null finding_id" ·
M3 "deleting a finding nulls eval_cases.finding_id and keeps the row" ·
M4 "a second running eval_runs row for one agent violates eval_runs_one_running" ·
M5 "deleting an eval case keeps its eval_case_results rows" ·
M6 "deleting an agent deletes its cases, runs and results".

### 3.3 Slice C — Server: scorer, cases, finding record
Files: `EV/{scoring,helpers,constants,repository,service,routes}.ts`,
`EV/scoring.test.ts`, `EV/helpers.test.ts`, `server/src/modules/index.ts`,
`server/src/platform/container.ts`,
`server/src/modules/reviews/{helpers,findings,service,repository}.ts`,
`reviews/repository/review.repo.ts`, `server/test/eval-cases.it.test.ts`,
`server/test/reviews.it.test.ts` (only an equality assertion that now needs
the field). Depends on: A, B.

- [x] T7 `matches`, `scoreCase`, `scoreRun` (D7) → AC-50 to AC-59, AC-108, AC-109, NFR-4, NFR-5 → SC1 to SC14
- [x] T8 `caseNameFromTitle`, `expectationFromFinding`, `fragmentForFile` → AC-3, AC-4, AC-5, AC-7, AC-8 → HP1 to HP5
- [x] T9 repository, cases: insert on conflict, list by agent with last result, get and delete scoped by workspace; `container.evalRepo` → AC-12, AC-113, NFR-1 → EC6, EC14, EC18
- [x] T10 `service.createCase` (D5) → AC-3 to AC-8, AC-12 to AC-19, AC-114, AC-122, NFR-4 → EC1 to EC10, EC12, EC13, EC16, EC20
- [x] T11 `service.overview` (cases; no run row can exist before slice D) and `service.deleteCase`, refused in one transaction while a run of the agent is `running` → AC-21, AC-117, AC-120, AC-121, AC-123, AC-126, NFR-4 → EC14, EC15, EC17, EC18
- [x] T12 the three case routes of D4 with response schemas; register the module → NFR-1, NFR-3 → EC21
- [x] T13 `eval_case_id` on every finding record (D6); `run-executor.ts` stays untouched → AC-9, AC-18, AC-121, NFR-8 → EC11, EC12, EC15

Tests — `EV/scoring.test.ts`:
SC1 "a finding matches when the file is equal and the ranges share one line" ·
SC2 "another file, or a path differing by case or prefix, does not match" ·
SC3 "a range with start_line above end_line is normalised before matching" ·
SC4 "must_find passes with one or more matches and fails with none" ·
SC5 "must_not_flag passes with no match and fails with one" ·
SC6 "recall is must_find cases passed over all must_find cases" ·
SC7 "precision is TP over TP plus FP, and two findings on one must_find count 2" ·
SC8 "citation_accuracy is surviving over surviving plus dropped across all cases" ·
SC9 "a surviving finding that matches nothing is unjudged and enters neither TP nor FP" ·
SC10 "a zero denominator gives null for recall, precision and citation_accuracy" ·
SC11 "changing severity, category, title and confidence changes nothing" ·
SC12 "the same input gives deep-equal output on repeated calls and is not mutated" ·
SC13 "scoring.ts imports only @devdigest/shared and scoreRun takes no provider" ·
SC14 "traces_passed counts passed cases and traces_total all cases".
`EV/helpers.test.ts`:
HP1 "caseNameFromTitle lowercases and kebab-cases a title" ·
HP2 "caseNameFromTitle returns a non-empty name for a title with no letter or digit" ·
HP3 "expectationFromFinding gives must_find for accepted and must_not_flag for dismissed, with file, lines, title, severity and category" ·
HP4 "fragmentForFile puts --- a/<path> and +++ b/<path> before the patch" ·
HP5 "a fragment parses to one file whose new-side lines are the patch's".
`server/test/eval-cases.it.test.ts` (mock LLM, real Postgres):
EC1 "an accepted finding becomes one must_find case owned by the review's agent, with the finding's file and lines" ·
EC2 "a dismissed finding becomes a must_not_flag case" ·
EC3 "input_diff is the stored patch of the finding's file under its two header lines, whatever the pr_files row order" ·
EC4 "input_meta holds the PR title and description at creation and keeps them after the PR's title, description and pr_files are replaced" ·
EC5 "the name is the finding's title in kebab-case and the expectation carries title, severity and category" ·
EC6 "a second creation request for one finding returns the existing case and leaves one row" ·
EC7 "an undecided finding is 409 finding_undecided and stores nothing" ·
EC8 "a finding whose review has no agent is 409 finding_agent_missing and stores nothing" ·
EC9 "a file with no stored patch is 409 diff_unavailable and stores nothing" ·
EC10 "a finding the grounding gate drops against the fragment is 409 finding_outside_stored_diff; a full-file kind is accepted" ·
EC11 "GET /pulls/:id/reviews and the accept and dismiss responses carry eval_case_id: the case id, else null" ·
EC12 "changing the finding's decision after creation leaves the expectation unchanged" ·
EC13 "deleting the finding's review keeps the case with finding_id null and the same input_diff, input_meta and expectation" ·
EC14 "GET /agents/:id/evals lists every case of the agent, last_result null before any run" ·
EC15 "DELETE /eval-cases/:id removes the case and the finding record then carries eval_case_id null" ·
EC16 "after a delete the finding becomes a case again, typed from its current decision" ·
EC17 "deleting a case while a run of its agent is running is 409 eval_run_in_progress and keeps the case" ·
EC18 "deleting an unknown case is 404, and so is a second delete" ·
EC20 "creating, listing and deleting a case record zero provider calls" ·
EC21 "case responses parse against the shared contracts and an invalid id is 422".

Note for test-writer: EC17 inserts the `running` row straight into
`eval_runs`.

### 3.4 Slice D — Server: runs, reads, reaper
Files: `EV/{run-executor,service,repository,routes,constants}.ts`,
`server/src/app.ts`, `server/test/eval-runs.it.test.ts`.
Depends on: C (same files, so serial).

- [x] T14 repository, runs: create with the case snapshot in one transaction, complete with results in one transaction, fail, list, detail, `failRunningRuns` → AC-33, AC-34, AC-38, AC-39, AC-41, AC-44, AC-99 → ER1, ER2, ER6, ER8, ER10, ER15
- [x] T15 `run-executor.ts` (D8) → AC-35, AC-36, AC-37, AC-40, AC-41, AC-42, AC-60, AC-129, NFR-4 → ER3, ER4, ER5, ER7, ER8, ER12
- [x] T16 `service.startRun` and `POST /agents/:id/eval-runs` → AC-32, AC-33, AC-43, AC-44, AC-114, NFR-1, NFR-2, NFR-3 → ER1, ER9, ER10, ER13, ER20, ER21
- [x] T17 overview gains `runs`, `runs_total`, `trend` and last results; `GET /eval-runs/:id` → AC-23, AC-61, AC-76, AC-78, AC-81, AC-83, AC-99, AC-128, NFR-3, NFR-4 → ER14, ER15, ER19, ER21, ER22
- [x] T18 `GET /eval/dashboard` (D10, spec-S7) → AC-67, AC-68, AC-71, NFR-3, NFR-4 → ER17, ER18, ER19
- [x] T19 boot reaper (D9) → AC-45 → ER11

Tests — `server/test/eval-runs.it.test.ts`:
ER1 "POST /agents/:id/eval-runs answers 201 with the id and running status of one stored run" ·
ER2 "the run stores the agent's version, system prompt, model and provider, and returns them unchanged after the agent is edited" ·
ER3 "a completed run has one result per case that was in the set at creation; a case created during the run is not in it" ·
ER4 "each case reaches the provider of the agent's provider id with the system prompt, model, enabled linked skills, the case's input_diff and its PR description" ·
ER5 "no request carries a repo map, callers digest, intent, project document or memory section, or the PR title" ·
ER6 "a completed run stores the three metrics, traces_passed, traces_total and duration_ms, equal to scoreRun over the fixture" ·
ER7 "cost_usd is the sum of the cases' costs, and null when one case's cost is unknown" ·
ER8 "a provider failure on the second of three cases stores failed, an error naming that case and the cause, null metrics and no results, after exactly two provider calls" ·
ER9 "an agent with no cases is 409 no_eval_cases and stores no run" ·
ER10 "a request while a run is running is 409 eval_run_in_progress and stores no run" ·
ER11 "building the app marks a run left running as failed with the interrupted error" ·
ER12 "a run over N cases records exactly N completeStructured calls and no other provider call" ·
ER13 "the 11th run request in a minute is 429" ·
ER14 "GET /agents/:id/evals returns the 20 newest runs newest first, the 20 newest completed runs oldest first, both counts, and each case's last result from the newest completed run that included it" ·
ER15 "GET /eval-runs/:id returns the stored run with its case results" ·
ER16 "deleting a case leaves every stored run's metrics, totals, cost and results unchanged, the deleted case's result included" ·
ER17 "GET /eval/dashboard lists each agent that has a case or a run with its newest completed run and up to 8 recall points oldest first; an agent with neither is absent" ·
ER18 "GET /eval/dashboard returns the 10 newest runs across agents, newest first, with the agent's name" ·
ER19 "the three read routes record zero provider calls" ·
ER20 "every eval route answers 404 for an id of another workspace" ·
ER21 "run and read responses parse against the shared contracts" ·
ER22 "GET /agents/:id/evals and GET /eval-runs/:id are 404 for an unknown id".

Notes for test-writer: ER3 and ER10 use a test-local `MockLLMProvider`
subclass that awaits a gate; ER8 one that throws on its second call; ER7
one that returns `costUsd: null` once. ER13 builds the app with
`nodeEnv: 'production'` and `logLevel: 'silent'` and posts an unknown uuid.
ER5 reads the section headings from `reviewer-core/src/prompt.ts`. Every
`buildApp` gets the fixture's `db`: without it the boot reaper runs against
the dev database. Runs are awaited by polling `GET /eval-runs/:id`.

### 3.5 Slice E — `verify:l06`
Files: `server/test/verify/l06.ts`, `server/test/verify/report.ts`,
`server/test/verify-l06.test.ts`, `server/package.json` (one script line, no
dependency, lockfile untouched), `Makefile`. Depends on: D.

- [x] T20 `evaluateReport` and the required-file list (D11) → AC-108, AC-109, AC-110, AC-111 → VR1 to VR6
- [x] T21 the runner: spawn, keys stripped, reason printed, exit code → AC-107, AC-110 → VR1; `pnpm verify:l06` exits 0 (§6)
- [x] T22 `"verify:l06": "tsx test/verify/l06.ts"` and `verify-l06: ## …` running `cd server && pnpm verify:l06` → AC-107, AC-112 → VR7; `make verify-l06` (§6)

Tests — `server/test/verify-l06.test.ts`:
VR1 "every required file present with every test passed is ok" ·
VR2 "a failed scorer test is not ok and is named" ·
VR3 "a skipped run-route test is not ok" ·
VR4 "a required file missing from the report is not ok" ·
VR5 "a failed contract-identity test or a failed provider-call test is not ok" ·
VR6 "the required list is scoring.test.ts, eval-contracts.test.ts and eval-runs.it.test.ts" ·
VR7 "the Makefile's verify-l06 recipe is cd server && pnpm verify:l06".

### 3.6 Slice F — Client foundation
Files: `client/messages/en/{eval,prReview,agents}.json`,
`client/src/app/layout.tsx`, `client/src/test/messages.ts`,
`client/src/test/eval-messages.test.ts`,
`client/src/lib/hooks/evals.ts` + `evals.test.ts`,
`CE/{helpers.ts,helpers.test.ts,constants.ts}`,
`CE/MetricTile/*`, `CE/RunsTable/*`,
`client/src/vendor/ui/charts/Sparkline.tsx` + `Sparkline.test.tsx`.
Depends on: A. Merge into `prReview.json` and `agents.json`, never replace a
block (client `INSIGHTS.md`, 2026-09-21).

- [x] T23 all copy of D17; `eval` in `USED_NAMESPACES`; `eval` and `agents` exported from the test messages → AC-1, AC-20, AC-26, AC-73 → N1, N2
- [x] T24 the six hooks of D12 → AC-11, AC-17, AC-32, AC-48, AC-119, AC-125 → HK1 to HK6
- [x] T25 `toPct`, `formatPct`, `pointDelta`, `definedPoints`, `formatRanAt`; `METRIC_COLOR`, `EVAL_POLL_MS` → AC-62, AC-64, AC-80, NFR-6 → FH1 to FH5
- [x] T26 `MetricTile`: label, display value, delta in points with arrow, optional sparkline → AC-61, AC-62, AC-64, AC-77, NFR-6 → MT1, MT2, MT3
- [x] T27 `RunsTable` (D13) → AC-64, AC-72, AC-81, AC-82, AC-84, NFR-6 → RT1 to RT5
- [x] T28 `Sparkline` draws one point as a dot → AC-68 → SP1

Tests — `client/src/test/eval-messages.test.ts`:
N1 "the message files hold every string the spec quotes for the eval surfaces, and prReview and agents keep their existing keys" ·
N2 "app/layout.tsx lists eval in USED_NAMESPACES".
`client/src/lib/hooks/evals.test.ts`:
HK1 "useAgentEvals reads GET /agents/:id/evals and never posts" ·
HK2 "while the newest run is running the overview is read again within 5 seconds, and not after it completes" ·
HK3 "useRunEvals posts once to /agents/:id/eval-runs and refreshes the agent's overview" ·
HK4 "useCreateEvalCase posts the finding id and refreshes every reviews query" ·
HK5 "useDeleteEvalCase sends DELETE and refreshes the overview and the reviews queries" ·
HK6 "a failed mutation rejects with the API's message".
`CE/helpers.test.ts`:
FH1 "toPct rounds half up: 0.825 is 83, 0.285 is 29, 0.004 is 0" ·
FH2 "formatPct renders — for null" ·
FH3 "pointDelta is the difference of two displayed percentages, and null when either is null" ·
FH4 "definedPoints drops null points and keeps order" ·
FH5 "METRIC_COLOR maps recall, precision and citation to --accent, --ok and --warn".
`CE/MetricTile/MetricTile.test.tsx`:
MT1 "shows the label, the value and a delta with an arrow and the points as text" ·
MT2 "a null value shows — with no delta and no sparkline" ·
MT3 "a zero delta shows 0pt with no arrow".
`CE/RunsTable/RunsTable.test.tsx`:
RT1 "renders Ran at, Version, Recall, Precision, Citation, Pass and Cost for each run in the order given" ·
RT2 "a metric cell has a bar and a whole percentage; a null metric shows — and no bar" ·
RT3 "a running or failed run shows its status in place of the metric bars" ·
RT4 "a null cost shows —" ·
RT5 "with no leading cell there is no checkbox".
`client/src/vendor/ui/charts/Sparkline.test.tsx`: SP1 "one point draws a dot and no NaN coordinate".

### 3.7 Slice G — Finding-card control
Files: `PR/_components/FindingCard/{FindingCard.tsx,FindingCard.test.tsx}`,
`FindingCard/_components/EvalCaseControl/*`,
`PR/_components/FindingsPanel/FindingsPanel.test.tsx`,
`PR/_components/DiffTab/DiffTab.test.tsx`. Depends on: F.

- [x] T29 `EvalCaseControl` (D14) → AC-2, AC-10, AC-11, AC-17, AC-122 → EV1 to EV7
- [x] T30 mount it after Dismiss in the action row → AC-1 → FC1, FP1, DT1

Tests — `EvalCaseControl/EvalCaseControl.test.tsx`:
EV1 "an undecided finding renders the control disabled with the explanation as its accessible description" ·
EV2 "an accepted finding: activating the control sends one creation request for that finding" ·
EV3 "a dismissed finding renders the control enabled" ·
EV4 "a finding with eval_case_id renders the created state and activating it sends no request" ·
EV5 "after a successful creation the refreshed finding shows the created state" ·
EV6 "a failed creation shows the API's message and leaves the control enabled" ·
EV7 "eval_case_id back to null renders the control enabled again".
`FindingCard.test.tsx`: FC1 "Turn into eval case follows Dismiss in the action row".
`FindingsPanel.test.tsx`: FP1 "an expanded card in the panel carries the Turn into eval case control".
`DiffTab.test.tsx`: DT1 "an inline finding card carries the Turn into eval case control".

### 3.8 Slice H — Evals tab
Files: `client/src/app/agents/[id]/page.tsx`, `page.test.tsx`,
`AE/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx}`,
`AE/_components/EvalsTab/*` with nested
`_components/{CaseRow,CaseModal,DeleteCaseDialog}/*`. Depends on: F.

- [x] T31 `evals` in `TABS` and `VALID_TABS`; the render branch → AC-20 → PG1, AE1
- [x] T32 `EvalsTab`: four tiles, heading with the passing badge, run control with its states and error, dashboard link, 5-row Recent runs → AC-25, AC-32, AC-46, AC-47, AC-48, AC-49, AC-61 to AC-65, AC-84, AC-127 → ET5, ET6, ET9 to ET19
- [x] T33 `CaseRow` and the list states; delete control disabled while a run is running → AC-21 to AC-24, AC-26, AC-27, AC-28, AC-115, AC-124 → ET1 to ET4, ET6, ET7, ET8, ET14, ET20
- [x] T34 `CaseModal`: read-only, diff lines classed by prefix and rendered as text, last-result line, Escape → AC-29, AC-30, AC-31, NFR-7 → CM1 to CM5
- [x] T35 `DeleteCaseDialog`: names the case, confirm and cancel, inline error → AC-116, AC-117, AC-118, AC-119, AC-125 → DC1 to DC4

Tests — `EvalsTab/EvalsTab.test.tsx`:
ET1 "lists one row per case with its name on one line" ·
ET2 "a must_find row shows severity and category, a must_not_flag row shows must not flag" ·
ET3 "a row with a last result shows a pass or fail icon and the expected and got counts" ·
ET4 "a never-run case shows a neutral icon and never run" ·
ET5 "the badge reads P / T passing" ·
ET6 "no cases: the empty state names accepted or dismissed findings on a pull request and the run control is disabled" ·
ET7 "loading shows a skeleton in place of the list" ·
ET8 "a failed request shows an error state whose retry refetches" ·
ET9 "four tiles show the newest completed run's values" ·
ET10 "with two completed runs each metric tile shows the delta in points with an up or down marker" ·
ET11 "no completed run: all four tiles show — and no delta" ·
ET12 "a null metric shows — with no delta" ·
ET13 "Run all evals posts to /agents/:id/eval-runs" ·
ET14 "during a run the run control is disabled and reads Running…, and the delete controls are disabled" ·
ET15 "when the polled run completes the tiles and the row results update" ·
ET16 "a failed newest run shows its error beside the run control" ·
ET17 "View full dashboard links to /eval/<agent id>" ·
ET18 "Recent runs lists the 5 newest runs with the seven columns and no checkbox or Compare control" ·
ET19 "no run: No runs yet replaces the Recent runs list" ·
ET20 "each row has a delete control".
`CaseModal/CaseModal.test.tsx`:
CM1 "shows the name, the PR title and description, the expectation and the last result" ·
CM2 "added and removed diff lines carry their own style and markup in the diff renders as text" ·
CM3 "no control edits, saves or runs the case" ·
CM4 "a last result reads Last run passed or Last run failed with expected and matched counts, seconds and USD" ·
CM5 "Escape closes the modal".
`DeleteCaseDialog/DeleteCaseDialog.test.tsx`:
DC1 "the delete control opens a confirmation naming the case, sends nothing and does not open the case modal" ·
DC2 "cancel keeps the row and sends no request" ·
DC3 "confirm sends DELETE and the row is gone after the refetch" ·
DC4 "a failed delete shows the API's message and keeps the row".
`AE/AgentEditor.test.tsx`: AE1 "the Evals tab is offered and renders the Evals tab body when selected".
`client/src/app/agents/[id]/page.test.tsx`: PG1 "?tab=evals selects the Evals tab".

### 3.9 Slice I — Agent view and Compare
Files: `client/src/app/eval/[agentId]/page.tsx`,
`client/src/app/eval/[agentId]/_components/AgentEvalView/*` with nested
`_components/{TrendChart,CompareModal}/*`. Depends on: F.

- [x] T36 page shell and `AgentEvalView`: header, three cards, run control with its states and error, not-found for 404 and 422 → AC-32, AC-46, AC-47, AC-48, AC-49, AC-76, AC-77, AC-83 → AV1 to AV5, AV8
- [x] T37 `TrendChart` (D16) → AC-78, AC-79, AC-80, NFR-6 → TC1, TC2, TC3
- [x] T38 Recent runs with selection: checkbox on completed rows only, "N selected", two at most, Compare enabled at exactly two, selection kept on close → AC-72, AC-81, AC-82, AC-85 to AC-88, AC-98 → AV6, AV7, AV9 to AV13
- [x] T39 `diffLines` (D15) → AC-93, AC-94 → DL1, DL2, DL3
- [x] T40 `CompareModal`: both runs through `useEvalRun`, older first by `ran_at`, four tiles, prompt diff or "System prompt unchanged", models, passed over total, case-set notice, Close only, Escape → AC-89 to AC-97, AC-128, NFR-6, NFR-7 → CP1 to CP11

Tests — `AgentEvalView/AgentEvalView.test.tsx`:
AV1 "shows the agent's name, model, run count, case count, a link back to all agents and Run eval" ·
AV2 "three cards show the newest completed run's value, the delta in points and a sparkline" ·
AV3 "Run eval posts to /agents/:id/eval-runs; it is disabled with no cases and reads Running… during a run" ·
AV4 "a polled completion updates the cards and the table" ·
AV5 "a failed newest run shows its error beside Run eval" ·
AV6 "Recent runs lists up to 20 runs with the seven columns" ·
AV7 "a null cost renders —" ·
AV8 "an unknown agent shows a not-found state with a link back to all agents" ·
AV9 "completed rows have a checkbox; running and failed rows have none and show their status" ·
AV10 "N selected follows the selection" ·
AV11 "Compare is disabled unless exactly two runs are selected" ·
AV12 "with two selected the other checkboxes are disabled" ·
AV13 "closing the Compare modal keeps both runs selected".
`TrendChart/TrendChart.test.tsx`:
TC1 "two or more completed runs draw one series per metric, oldest first, under a legend naming Recall, Precision and Citation" ·
TC2 "fewer than two completed runs show the text placeholder" ·
TC3 "a null metric leaves that run out of that series only".
`CompareModal/helpers.test.ts`:
DL1 "lines only in the older text are removed and lines only in the newer text are added, in order" ·
DL2 "identical texts give no added or removed line" ·
DL3 "a line inserted in the middle leaves the lines around it unchanged".
`CompareModal/CompareModal.test.tsx`:
CP1 "the title is vA → vB with the earlier ran_at first, whatever the selection order" ·
CP2 "the Recall, Precision and Citation tiles show the older value, the newer value and the delta in points with a marker" ·
CP3 "the Cost tile shows both costs and their difference in USD" ·
CP4 "a null value shows — and its tile has no delta" ·
CP5 "the prompt diff marks removed and added lines under a legend naming both versions, as text" ·
CP6 "identical prompts show System prompt unchanged" ·
CP7 "differing models show both ids, older first" ·
CP8 "each run's passed over total is shown" ·
CP9 "Close is the only footer action" ·
CP10 "different case_id sets show the notice with the count only in the older and only in the newer run, also when the totals are equal" ·
CP11 "Escape closes the modal".

### 3.10 Slice J — Eval Dashboard, all agents
Files: `client/src/app/eval/page.tsx`,
`client/src/app/eval/_components/EvalDashboardView/*`,
`client/src/vendor/ui/nav.ts`, `nav.test.ts`. Depends on: F.

- [x] T41 nav entry `eval` / "Eval Dashboard" / `Gauge` / `/eval` after Conventions, no shortcut → AC-66 → NV1
- [x] T42 page shell and `EvalDashboardView`: agent rows, sparkline, row link, empty, skeleton, error → AC-67 to AC-70, AC-73, AC-74, AC-75, AC-80 → DB1 to DB4, DB7, DB8, DB9
- [x] T43 "Recent eval runs · all agents" through `RunsTable` with the agent name as leading cell and no cost column → AC-71, AC-72 → DB5, DB6

Tests — `client/src/vendor/ui/nav.test.ts`: NV1 "SKILLS LAB has an Eval Dashboard entry after Conventions that opens /eval".
`EvalDashboardView/EvalDashboardView.test.tsx`:
DB1 "lists each agent with name, model, version, run time, P/T pass and the three metrics of its newest completed run" ·
DB2 "draws a recall sparkline from the trend points, nulls left out" ·
DB3 "an agent with no completed run shows No runs yet, — for its metrics and no sparkline" ·
DB4 "activating a row opens /eval/<agent id>" ·
DB5 "Recent eval runs · all agents lists runs with the agent's name, time, version, metric bars with a percentage and passed over total" ·
DB6 "a running or failed run shows its status in place of the bars" ·
DB7 "no agent: the empty state names accepted or dismissed findings on a pull request" ·
DB8 "loading shows a skeleton" ·
DB9 "a failed request shows an error state whose retry refetches".

### 3.11 Slice K — Demo seed and browser flows (droppable)
Files: `server/src/db/seed-evals.ts`, `server/src/db/seed.ts` (one import,
one call after `seedBrief`), `server/test/seed-fixtures.test.ts`,
`server/test/eval-seed.it.test.ts`,
`e2e/specs/{15-agent-evals-tab,16-eval-dashboard-compare,17-finding-to-eval-case}.flow.json`,
`e2e/.context/docs/seed-contract.md`. Depends on: D, G, H, I, J. Nothing
before this slice reads anything it writes.

- [x] T44 the fixture and `seedEvals` (D19); every fixture text is read against the patch body in `seed-diffs.ts` (root `INSIGHTS.md`, 2026-10-03) → AC-100, AC-101, AC-102, AC-103 → SF1, SF2, SF3, SD1 to SD4
- [ ] T45 flow 15: Agents → Eval Demo Reviewer → Evals tab → wait for the seeded case name and the four tile labels as rendered; no click on a run control → AC-104 → E15
- [ ] T46 flow 16: sidebar Eval Dashboard → the agent's row → the two run checkboxes by accessible name → Compare → wait for the line only the v2 prompt holds → AC-105 → E16
- [ ] T47 flow 17: PR #482 → Agent runs → the first card's "Turn into eval case" → wait for "Eval case created" → AC-106 → E17
- [x] T48 one seed-contract row per waited value, and a note that flow 17 needs a fresh stack → AC-104, AC-105, AC-106 → `make e2e` 17 of 17

Tests — `server/test/seed-fixtures.test.ts`:
SF1 "every eval fixture expectation survives groundFindings against its case's input_diff" ·
SF2 "each eval fixture run's stored results and metrics equal scoreRun over its seeded findings" ·
SF3 "the eval fixture has a must_find case, a must_not_flag case and two completed runs whose agent_version and system_prompt differ".
`server/test/eval-seed.it.test.ts`:
SD1 "a seeded database has the fixture agent with its cases and two completed runs" ·
SD2 "the seeded accepted Stripe finding has no eval case and its review has an agent" ·
SD3 "re-running the seed adds no case or run and keeps a user's decision on a finding" ·
SD4 "the seeded accepted finding becomes a case through POST /findings/:id/eval-case".
E15 `15-agent-evals-tab.flow.json` · E16 `16-eval-dashboard-compare.flow.json`
· E17 `17-finding-to-eval-case.flow.json`. Put `wait --load networkidle`
before each `find`, and assert label text in its rendered case (e2e
`INSIGHTS.md`).

## 4. Traceability

| AC | Task | Test | Commit |
|---|---|---|---|
| AC-1 | T23, T30 | N1, FC1, FP1, DT1 | 2081e0f, a8caf40 |
| AC-2 | T29 | EV1 | a8caf40 |
| AC-3 | T1, T6, T8, T10 | HP3, EC1 | 048ba42, 52d7c29, 114d461 |
| AC-4 | T8, T10 | HP3, EC2 | 114d461 |
| AC-5 | T8, T10 | HP4, HP5, EC3 | 114d461 |
| AC-6 | T10 | EC4 | 114d461 |
| AC-7 | T8, T10 | HP1, HP2, EC5 | 114d461 |
| AC-8 | T8, T10 | HP3, EC5 | 114d461 |
| AC-9 | T2, T13 | K5, EC11 | 048ba42, 114d461 |
| AC-10 | T29 | EV4 | a8caf40 |
| AC-11 | T24, T29 | HK4, EV5 | 2081e0f, a8caf40 |
| AC-12 | T9, T10 | EC6 | 114d461 |
| AC-13 | T10 | EC7 | 114d461 |
| AC-14 | T10 | EC8 | 114d461 |
| AC-15 | T10 | EC9 | 114d461 |
| AC-16 | T10 | EC10 | 114d461 |
| AC-17 | T24, T29 | HK6, EV6 | 2081e0f, a8caf40 |
| AC-18 | T10, T13 | EC12 | 114d461 |
| AC-19 | T6, T10 | M3, EC4, EC13 | 52d7c29, 114d461 |
| AC-20 | T23, T31 | PG1, AE1 | 2081e0f, e88754b |
| AC-21 | T11, T33 | EC14, ET1 | 114d461, e88754b |
| AC-22 | T33 | ET2 | e88754b |
| AC-23 | T17, T33 | ER14, ET3 | e88754b, c7ff723 |
| AC-24 | T33 | ET4 | e88754b |
| AC-25 | T32 | ET5 | e88754b |
| AC-26 | T23, T33 | N1, ET6 | 2081e0f, e88754b |
| AC-27 | T33 | ET7 | e88754b |
| AC-28 | T33 | ET8 | e88754b |
| AC-29 | T34 | CM1, CM2 | e88754b |
| AC-30 | T34 | CM3 | e88754b |
| AC-31 | T34 | CM4 | e88754b |
| AC-32 | T16, T24, T32, T36 | HK3, ET13, AV3 | 2081e0f, e88754b, f2fed6d, c7ff723 |
| AC-33 | T1, T14, T16 | ER1 | 048ba42, c7ff723 |
| AC-34 | T14 | ER2 | c7ff723 |
| AC-35 | T15 | ER3 | c7ff723 |
| AC-36 | T15 | ER4 | c7ff723 |
| AC-37 | T15 | ER5 | c7ff723 |
| AC-38 | T1, T5, T6, T14 | M1, ER3, ER15 | 048ba42, 52d7c29, c7ff723 |
| AC-39 | T14 | SC14, ER6 | c7ff723 |
| AC-40 | T15 | ER7 | c7ff723 |
| AC-41 | T14, T15 | ER8 | c7ff723 |
| AC-42 | T15 | ER8 | c7ff723 |
| AC-43 | T16 | ER9 | c7ff723 |
| AC-44 | T6, T14, T16 | M4, ER10 | 52d7c29, c7ff723 |
| AC-45 | T19 | ER11 | c7ff723 |
| AC-46 | T32, T36 | ET6, AV3 | e88754b, f2fed6d |
| AC-47 | T32, T36 | ET14, AV3 | e88754b, f2fed6d |
| AC-48 | T24, T32, T36 | HK2, ET15, AV4 | 2081e0f, e88754b, f2fed6d |
| AC-49 | T32, T36 | ET16, AV5 | e88754b, f2fed6d |
| AC-50 | T7 | SC1, SC2, SC3 | 114d461 |
| AC-51 | T7 | SC4 | 114d461 |
| AC-52 | T7 | SC5 | 114d461 |
| AC-53 | T7 | SC6 | 114d461 |
| AC-54 | T7 | SC7 | 114d461 |
| AC-55 | T7 | SC8 | 114d461 |
| AC-56 | T7 | SC9 | 114d461 |
| AC-57 | T7 | SC10 | 114d461 |
| AC-58 | T7 | SC11 | 114d461 |
| AC-59 | T7 | SC13 | 114d461 |
| AC-60 | T15 | ER12 | c7ff723 |
| AC-61 | T17, T26, T32 | ER14, ET9 | 2081e0f, e88754b, c7ff723 |
| AC-62 | T25, T26, T32 | FH1, FH3, MT1, MT3, ET10 | 2081e0f, e88754b |
| AC-63 | T32 | ET11 | e88754b |
| AC-64 | T25, T26, T27, T32 | FH2, MT2, RT2, ET12 | 2081e0f, e88754b |
| AC-65 | T32 | ET17 | e88754b |
| AC-66 | T41 | NV1 | 33991ff |
| AC-67 | T18, T42 | M6, ER17, DB1 | 33991ff, c7ff723 |
| AC-68 | T18, T28, T42 | ER17, SP1, DB2 | 2081e0f, 33991ff, c7ff723 |
| AC-69 | T42 | DB3 | 33991ff |
| AC-70 | T42 | DB4 | 33991ff |
| AC-71 | T18, T43 | ER18, DB5 | 33991ff, c7ff723 |
| AC-72 | T27, T38, T43 | RT3, AV9, DB6 | 2081e0f, f2fed6d, 33991ff |
| AC-73 | T23, T42 | N1, DB7 | 2081e0f, 33991ff |
| AC-74 | T42 | DB8 | 33991ff |
| AC-75 | T42 | DB9 | 33991ff |
| AC-76 | T17, T36 | ER14, AV1 | f2fed6d, c7ff723 |
| AC-77 | T26, T36 | MT1, AV2 | 2081e0f, f2fed6d |
| AC-78 | T17, T37 | ER14, TC1 | f2fed6d, c7ff723 |
| AC-79 | T37 | TC2 | f2fed6d |
| AC-80 | T25, T37, T42 | FH4, TC3, DB2 | 2081e0f, f2fed6d, 33991ff |
| AC-81 | T17, T27, T38 | ER14, RT1, AV6 | 2081e0f, f2fed6d, c7ff723 |
| AC-82 | T27, T38 | RT4, AV7 | 2081e0f, f2fed6d |
| AC-83 | T17, T36 | M6, ER22, AV8 | f2fed6d, c7ff723 |
| AC-84 | T27, T32 | RT5, ET18 | 2081e0f, e88754b |
| AC-85 | T38 | AV9 | f2fed6d |
| AC-86 | T38 | AV10 | f2fed6d |
| AC-87 | T38 | AV11 | f2fed6d |
| AC-88 | T38 | AV12 | f2fed6d |
| AC-89 | T40 | CP1 | f2fed6d |
| AC-90 | T40 | CP2 | f2fed6d |
| AC-91 | T40 | CP3 | f2fed6d |
| AC-92 | T40 | CP4 | f2fed6d |
| AC-93 | T39, T40 | DL1, DL3, CP5 | f2fed6d |
| AC-94 | T39, T40 | DL2, CP6 | f2fed6d |
| AC-95 | T40 | CP7 | f2fed6d |
| AC-96 | T40 | CP8 | f2fed6d |
| AC-97 | T40 | CP9 | f2fed6d |
| AC-98 | T38 | AV13 | f2fed6d |
| AC-99 | T14, T17 | ER2, ER15 | c7ff723 |
| AC-100 | T44 | SF3, SD1, SD3 | 92355be |
| AC-101 | T44 | SD2, SD3 | 92355be |
| AC-102 | T44 | SF2 | 92355be |
| AC-103 | T44 | SF1 | 92355be |
| AC-104 | T45, T48 | E15 | 92355be |
| AC-105 | T46, T48 | E16 | 92355be |
| AC-106 | T47, T48 | SD4, E17 | 92355be |
| AC-107 | T21, T22 | VR1; `pnpm verify:l06` exits 0 (§6) | 4163b46 |
| AC-108 | T7, T20 | SC4 to SC8, VR2 | 114d461, 4163b46 |
| AC-109 | T7, T20 | SC13, ER12, VR5 | 114d461, 4163b46 |
| AC-110 | T20, T21 | ER6, VR3, VR4 | 4163b46 |
| AC-111 | T3, T4, T20 | C1, VR5, VR6 | 048ba42, 4163b46 |
| AC-112 | T22 | VR7; `make verify-l06` (§6) | 4163b46 |
| AC-113 | T5, T6, T9 | M2, EC6 | 52d7c29, 114d461 |
| AC-114 | T10, T16 | EC7 to EC10, ER9, ER10 | 114d461, c7ff723 |
| AC-115 | T33 | ET20 | e88754b |
| AC-116 | T35 | DC1 | e88754b |
| AC-117 | T11, T35 | EC15, DC3 | 114d461, e88754b |
| AC-118 | T35 | DC2 | e88754b |
| AC-119 | T24, T35 | HK5, DC3 | 2081e0f, e88754b |
| AC-120 | T6, T11 | M5, ER16 | 52d7c29, 114d461 |
| AC-121 | T11, T13 | EC15 | 114d461 |
| AC-122 | T10, T29 | EC16, EV7 | 114d461, a8caf40 |
| AC-123 | T11 | EC17 | 114d461 |
| AC-124 | T33 | ET14 | e88754b |
| AC-125 | T24, T35 | HK6, DC4 | 2081e0f, e88754b |
| AC-126 | T11 | EC18 | 114d461 |
| AC-127 | T32 | ET19 | e88754b |
| AC-128 | T17, T40 | ER15, CP10 | f2fed6d, c7ff723 |
| AC-129 | T15 | ER12 | c7ff723 |
| NFR-1 | T9, T12, T16 | ER20 | 114d461, c7ff723 |
| NFR-2 | T16 | ER13 | c7ff723 |
| NFR-3 | T1, T3, T12, T16, T17, T18 | K1 to K4, EC21, ER21 | 048ba42, 114d461, c7ff723 |
| NFR-4 | T7, T10, T11, T15, T17, T18 | SC13, EC20, ER12, ER19 | 114d461, c7ff723 |
| NFR-5 | T7 | SC12 | 114d461 |
| NFR-6 | T25, T26, T27, T37, T40 | FH5, MT1, RT2, TC1, CP2 | 2081e0f, f2fed6d |
| NFR-7 | T34, T40 | CM5, CP11 | e88754b, f2fed6d |
| NFR-8 | T13 | EC11; the `reviewer-core` and `mcp` lanes of `make test` green with no file of either package, nor `reviews/run-executor.ts`, in the diff (§6) | 114d461 |

## 5. Execution

    A ──┬── C ── D ── E ──────────────┐
    B ──┘                             │
    A ───── F ──┬── G ────────────────┼── K
                ├── H ────────────────┤
                ├── I ────────────────┤
                └── J ────────────────┘

| Slice | Tasks | After | Can run beside |
|---|---|---|---|
| A Contracts | 4 | — | B |
| B Schema, migrations | 2 | — | A |
| C Server: scorer, cases | 7 | A, B | F |
| D Server: runs, reads | 6 | C | F, G, H, I, J |
| E `verify:l06` | 3 | D | F, G, H, I, J |
| F Client foundation | 6 | A | B, C, D, E |
| G Finding control | 2 | F | C, D, E, H, I, J |
| H Evals tab | 5 | F | C, D, E, G, I, J |
| I Agent view, Compare | 5 | F | C, D, E, G, H, J |
| J Dashboard, nav | 3 | F | C, D, E, G, H, I |
| K Seed, e2e | 5 | D, G, H, I, J | nothing |

Serial by necessity: C → D → E share `EV/` files; F precedes every client
slice because it is the single writer of the copy and of `CE/`.

Single-writer files: both `SH/` copies → A. `db/schema/**`,
`db/migrations/**` → B. `modules/index.ts`, `platform/container.ts`, the
`reviews/` files → C (A touches `reviews/helpers.ts` once, before it).
`app.ts` → D. `server/package.json`, `Makefile` → E. `messages/en/*.json`,
`layout.tsx`, `test/messages.ts`, `Sparkline.tsx` → F. `nav.ts` → J.
`db/seed.ts` → K. A slice that needs a line in another slice's file returns
to the parent instead of writing it.

Rules for slices that share the working tree:
- A parallel slice verifies with scoped commands only
  (`pnpm exec vitest run <its own paths>`); a whole-package `typecheck`
  would read a neighbour's half-written file. The parent runs
  `make typecheck` and `make test` at each group boundary.
- Nobody runs `make check`, `build-web` or `make e2e` while a group is in
  flight.
- No slice adds a dependency, so no lockfile changes.
- While the user has an eval run in flight under `make dev`, nobody runs the
  server unit lane: `routes-smoke.test.ts` builds the app against
  `DATABASE_URL` and the boot reaper would fail that run (§1).

Order under the deadline, single agent: A, B, C, D, E, F, G, H, I, J, K.
Multi-agent: group 1 A ∥ B; group 2 (C → D → E) ∥ F; group 3 G ∥ H ∥ I ∥ J,
started when F lands, whether or not D has; group 4 K.

Demo-able after slices A to H: a case from a finding in one click, both
types (C, G); a run and its metrics on the Evals tab, with deltas against
the previous run and the Recent runs list (D, H); scoring with no model
call (C); `pnpm verify:l06` green (E). The spec's own mapping also cites
Compare (AC-89 to AC-93) for "a prompt change visibly moves the metrics",
and user step 4 needs the Compare screenshot: that is slice I. Cut order if
time runs out: K first, then J (the nav entry goes with it, so no dead
link). I is not a cut candidate.

After B lands the dev database needs `pnpm db:migrate` (or `make dev`);
`0017` drops two tables, so the parent re-checks that both are still empty
first.

Not planned, no criterion asks for it: a `CLAUDE.md`, `TESTING.md` or
README line for `verify:l06` (`make help` lists the target from its `##`
comment; a `CLAUDE.md` edit would call for `eval:workflow`), README route
maps, any `mcp/` or `reviewer-core/` change, a CI workflow.

## 6. Verification

- Per slice, scoped: A `cd server && pnpm exec vitest run test/contracts.test.ts test/eval-contracts.test.ts`;
  B `… test/eval-schema.it.test.ts` and `git status server/src/db/migrations`
  showing only generated files; C `… src/modules/eval test/eval-cases.it.test.ts test/reviews.it.test.ts`;
  D `… test/eval-runs.it.test.ts`; E `… test/verify-l06.test.ts`;
  F to J `cd client && pnpm exec vitest run <slice paths>`.
- At each group boundary: `make typecheck` · `make lint` (client 0 errors /
  52 warnings, server 0 / 0) · `make lint-arch` (0 errors; by rule still 8
  `no-circular` and 10 `persistence-in-service`, at most 9 and 10) ·
  `make test` · `make test-it` (Docker).
- After E: `cd server && pnpm verify:l06; echo $?` prints 0 with Docker up
  and no provider key exported; with Docker stopped it prints non-zero;
  `make verify-l06; echo $?` matches both.
- After J: `make check` with `make dev` stopped, so `build-web` runs (slice
  F adds value imports of Zod schemas; client `INSIGHTS.md`, 2026-09-20).
- After K: `cd e2e && npm ci` once, then `make e2e` ends 17 of 17.
- `diff -r client/src/vendor/shared server/src/vendor/shared` still lists
  only `adapters.ts` and `contracts/{eval-ci,knowledge,productionize,trace}.ts`.
- `git diff --stat reviewer-core mcp server/src/modules/reviews/run-executor.ts`
  is empty (NFR-8).
- Manual, by the user: the seven steps of the spec's _Definition of done and
  demo_ on General Reviewer; NFR-6 read once in the light theme.
