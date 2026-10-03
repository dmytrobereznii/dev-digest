# Spec: PR Why + Risk Brief
Spec ID: SPEC-12
Status: approved
Supersedes: —

## Problem and user

A reviewer opens someone else's pull request cold. They do not know why the
change exists, what can go wrong, or which file to read first. The Overview
tab already answers part of it: the Intent card says what the PR is for (L03,
spec 07), the Blast radius card says what else it can affect (L04, spec 10),
and the Files changed tab sorts files by role (L03, spec 08). Nothing joins
them, nothing names the risks, and nothing says where to start reading.

This change adds a **brief** to the PR Brief section of the Overview tab: a
short summary of what the PR does and why, a list of **Risk areas** each tied
to a file, and a **Review focus** list of `file:line` entries to read first,
each a link into the Files changed tab. The brief is generated on request by
one model call that receives facts the system already holds. It is stored, so
a reload shows it without paying again.

Terms used below, each with one meaning:

- **Brief**: the stored result of one generation for one PR.
- **Changed file**: a path in the PR's stored file list. Files are keyed by
  path; the list has no stable order (`server/.context/insights/INSIGHTS.md`,
  2026-09-23).
- **Changed range**: the new-side line range of one hunk of a changed file,
  read from the hunk header of its stored patch.
- **Blast is available**: the blast read for the PR lists at least one changed
  symbol, or reports `status: ok`. Otherwise blast is **missing**.
- **Stale**: the brief's `head_sha` differs from the PR's current head SHA.

Sources: the L05 lesson brief (task message), the design source
`.context/docs/design/src/screen_pr_detail.jsx:20-80` and `findings.jsx:78-100`,
screenshot 2 (Overview with the PR Brief card) and screenshot 3 (Files
changed), and the live code cited inline. Removed implementations in git
history were not read (root `INSIGHTS.md`, 2026-09-16). The user's answers of
2026-10-03 to this spec's eight questions are recorded under Decisions.

Scope by package: `server/` (the brief routes and storage, the `risk_brief`
default, the demo seed), `client/` (the PR Brief section and the Files changed
target), both vendored copies of `@devdigest/shared`, and `e2e/` (one flow).
`reviewer-core/` and `mcp/` keep their behaviour.

## Goals / Non-goals

Goals:

- G1. A reviewer can generate a brief for a PR from the Overview tab and read
  its summary, Risk areas and Review focus beside the Intent and Blast radius
  cards.
- G2. A Review focus entry takes the reviewer to that file on the Files
  changed tab.
- G3. A generated brief is stored and shown again on reload with no model
  call; a refresh control regenerates it.
- G4. One generation costs exactly one model call, and the model never
  receives diff code.
- G5. A brief generated on fewer facts says which facts were missing.
- G6. A file or line the model names that the PR does not contain never
  reaches the reviewer.
- G7. A generation runs on the default model with the API key the install
  already needs for its agents.
- G8. The demo PR shows a brief on a fresh install, and one deterministic
  browser flow covers rendering, reload and the Review focus click.

Non-goals (P3 items of the lesson are marked):

- The verdict and PR score banner (P3 in the lesson). It already ships on the
  Overview tab (`OverviewTab.tsx:31-46`, pulled forward by spec 07 D11). This
  change leaves it as it is, its summary text included (AC-46).
- Changing the default of any feature model other than `risk_brief`.
- Extending the seeded files or patches of PR #482 so that more of the design
  fixture grounds.
- A browser flow that generates or refreshes a brief. The e2e stack has no
  model key (`e2e/README.md:5`).
- The expandable risk explanation (P3). The design draws it
  (`screen_pr_detail.jsx:33-36`); the `explanation` field is stored and not
  shown.
- "Prior PRs touching these files" (P3). Spec 10 put it out of scope by user
  decision; `history` stays an empty list.
- Generating a brief on page open, on import or during a review run, and
  regenerating automatically when the brief is stale.
- Deriving intent, building the repository index or fetching from GitHub as
  part of a generation.
- Treating a re-derived intent, a rebuilt index or a changed attachment as
  stale. Only the head SHA counts; refresh covers the rest.
- Keeping earlier briefs. One brief per PR.
- Feeding the brief into review prompts, the run trace or any MCP tool.
  `mcp/` and the review run are unchanged.
- Streaming or step-by-step progress during generation.
- Changing what the Intent card, the Blast radius card or Smart Diff compute.
- Keeping the Smart or Original order choice in the URL (spec 08 D11 keeps it
  local, `DiffTab.tsx:47`).
- Navigation from a risk's file reference. It renders as text (D15).
- A Back-button return from Files changed to Overview. A Review focus click
  adds no browser history entry, like every tab change (`page.tsx:75`, D16).

## User stories

- US-1: As a reviewer, I want to generate a brief from the Overview tab, so
  that I learn what the PR does and why before reading code.
- US-2: As a reviewer, I want each risk shown with its name and its file, so
  that I know where the danger is.
- US-3: As a reviewer, I want a list of `file:line` entries with reasons that
  open the file on Files changed, so that I start with the lines that matter.
- US-4: As a reviewer, I want the same brief after a reload, so that I do not
  wait or pay twice.
- US-5: As a reviewer, I want a refresh control, so that I can regenerate the
  brief after the PR or its inputs change.
- US-6: As a reviewer, I want to see which facts the brief was generated
  without, so that I know how far to trust it.

## Acceptance criteria (EARS)

Each criterion carries its story and its priority. P1 must be visible in the
demo; P2 does not block acceptance. The lesson gives no P1 list beyond the
five stories, so a priority marked † is inferred.

### Contract and storage

- AC-1 (US-1, P1): The `PrBrief` contract shall carry a `summary` string and a
  `review_focus` list whose items are `{ file: string, line: integer ≥ 1, reason: string }`.
- AC-2 (US-6, P1†): The `PrBrief` contract shall accept `null` for `intent`
  and for `blast`.
- AC-3 (US-1, P1): The file `contracts/brief.ts` shall be byte-identical in
  the two vendored copies of `@devdigest/shared`.
- AC-4 (US-4, P1): When a generation succeeds, the API shall store the brief
  in `pr_brief.json` with the PR head SHA it was generated for inside that
  JSON.
- AC-5 (US-5, P1): When a generation succeeds for a PR that already has a
  stored brief, the API shall replace the stored brief, so that one brief per
  PR is stored.

### Reading the brief

- AC-6 (US-4, P1): When the brief of a PR is read, the API shall return the
  stored brief record, or `brief: null` when none is stored.
- AC-7 (US-4, P1): When the brief of a PR is read, the API shall make zero
  model calls.
- AC-8 (US-5, P2): While the stored brief's `head_sha` differs from the PR's
  current head SHA, the API shall return the brief with `stale: true`.
- AC-9 (US-1, P1†): If a brief route is called with a PR id that is not in the
  workspace, then the API shall respond 404.
- AC-10 (US-4, P2): If the stored JSON does not satisfy the brief contract,
  then the API shall return `brief: null`.

### Generating the brief

- AC-11 (US-1, P1): When a generation is requested, the API shall send exactly
  one structured-completion request to the model.
- AC-12 (US-1, P1): The API shall send the generation request to the provider
  and model resolved for `risk_brief`: the workspace's choice in Settings,
  else the registry default.
- AC-13 (US-1, P1): The generation request shall contain the PR's title and
  description.
- AC-14 (US-1, P1): The generation request shall contain, for each changed
  file, its path, its Smart Diff role, its additions and its deletions.
- AC-15 (US-3, P1†): The generation request shall contain, for each changed
  file that has a stored patch, its changed ranges as line numbers only.
- AC-16 (US-1, P1): While the PR has a stored intent, the generation request
  shall contain its intent sentence, its in-scope list and its out-of-scope
  list.
- AC-17 (US-1, P1): While blast is available, the generation request shall
  contain the blast summary, the changed symbols and the distinct files of
  their callers.
- AC-18 (US-1, P1): While at least one attached document is readable, the
  generation request shall contain the text of each included document under
  its path, where an attached document is one the Project Context page counts
  as used by at least one agent for the PR's repository.
- AC-19 (US-1, P2): The API shall include attached documents in path order
  while their token total stays within the Project Context budget, each whole
  or not at all.
- AC-84 (US-1, P2†): The brief's output schema shall accept a summary of 1 to
  400 characters.
- AC-85 (US-2, P2†): The brief's output schema shall accept at most 6 risks.
- AC-86 (US-3, P2†): The brief's output schema shall accept at most 6 Review
  focus items.
- AC-88 (US-1, P2†): The generation request shall state the three caps of
  AC-84 to AC-86 to the model.
- AC-20 (US-1, P1): The generation request shall contain no added, removed or
  context line from any file's patch.
- AC-21 (US-6, P1): While the PR has no stored intent, when a generation is
  requested, the API shall generate the brief and list `intent` in its
  `missing_inputs`.
- AC-22 (US-6, P1): While blast is missing, when a generation is requested,
  the API shall generate the brief and list `blast` in its `missing_inputs`.
- AC-23 (US-6, P1): While no attached document is included, when a generation
  is requested, the API shall generate the brief and list `specs` in its
  `missing_inputs`.
- AC-24 (US-6, P2): The API shall store in `specs_used` the path of each
  document the generation request contained.
- AC-25 (US-1, P2): The API shall store with the brief the model slug, the
  input tokens, the output tokens and the estimated cost in USD of its
  generation.

### Grounding the model's output

- AC-26 (US-3, P1†): If a `review_focus` item names a file that is not a
  changed file, then the API shall omit the item from the stored brief.
- AC-27 (US-3, P2): If a `review_focus` item's line lies outside every changed
  range of its file, then the API shall omit the item from the stored brief.
- AC-28 (US-2, P1†): If a risk's `file_refs` item names a path that is not a
  changed file, then the API shall remove that item from the risk.
- AC-29 (US-2, P1†): If a risk is left with no file reference, then the API
  shall omit the risk from the stored brief.
- AC-30 (US-2, P2): If a `file_refs` item carries a line or line range that
  overlaps no changed range of its file, then the API shall store the item as
  the path alone.
- AC-31 (US-6, P2): The API shall store in `dropped` the number of risks and
  the number of Review focus items it omitted.
- AC-32 (US-3, P1): The API shall store `review_focus` items in the order the
  model returned them.

### Failure and in-flight

- AC-33 (US-1, P1†): If the model call fails, then the API shall respond 502
  with error code `brief_failed`.
- AC-76 (US-1, P1†): If the model call fails because the resolved provider has
  no API key, then the API's error message shall name the missing key.
- AC-87 (US-1, P2†): If the model's output still exceeds a cap of AC-84 to
  AC-86 after the adapter's reprompts, then the API shall respond 502 with
  error code `brief_failed`.
- AC-34 (US-5, P1†): If a generation fails, then the API shall leave the
  stored brief of the PR unchanged.
- AC-35 (US-1, P2): If a generation is requested for a PR with zero changed
  files, then the API shall respond 422 with error code `brief_no_files`
  without calling the model.
- AC-36 (US-1, P2): While a generation for a PR is in flight, when another is
  requested for the same PR, the API shall respond 409 with error code
  `brief_in_progress` without calling the model.
- AC-37 (US-4, P2): While a generation for a PR is in flight, the API shall
  return `generating: true` when the brief of that PR is read.

### PR Brief section: states

- AC-38 (US-1, P1): While no brief is stored and none is generating, the PR
  Brief section shall show the text "Brief not available yet." and a button
  labelled "Generate brief".
- AC-39 (US-1, P1†): While no brief is stored, the PR Brief section shall
  render no Risk areas block and no Review focus block.
- AC-40 (US-1, P1): The Overview tab shall render the Intent card and the
  Blast radius card in every state of the brief.
- AC-41 (US-1, P1): When the user activates "Generate brief", the PR Brief
  section shall send one generation request.
- AC-42 (US-1, P1): While a generation request is pending, the PR Brief
  section shall show the control that started it disabled and labelled
  "Generating…".
- AC-43 (US-1, P1): When a generation succeeds, the PR Brief section shall
  show the returned brief without a page reload.
- AC-44 (US-4, P1): When the Overview tab loads for a PR with a stored brief,
  the PR Brief section shall show that brief without sending a generation
  request.
- AC-45 (US-1, P1): While a brief is stored, the PR Brief section shall show
  its summary as a paragraph in a summary block of its own, directly below
  the verdict banner or the "Not reviewed yet" note and directly above the
  Intent and Blast radius grid.
- AC-46 (US-1, P1†): While a review with a verdict exists, the verdict banner
  on the Overview tab shall show that review's summary, whether or not a
  brief is stored.
- AC-47 (US-1, P1†): While no review with a verdict exists, the PR Brief
  section shall show the "Not reviewed yet" note (`prReview.json`,
  `overview.noReview`), whether or not a brief is stored.
- AC-79 (US-1, P1†): While no brief is stored, the PR Brief section shall show
  the empty state of AC-38 in the summary block's position.
- AC-80 (US-5, P2†): The PR Brief section shall place the refresh control at
  the right end of the summary block.
- AC-48 (US-2, P1): While a brief is stored, the PR Brief section shall show a
  "Risk areas" block below the Intent block in the left column, listing each
  risk's title and its file references.
- AC-49 (US-2, P1): The Risk areas block shall colour each risk's icon by
  severity: `high` as `var(--crit)`, `medium` as `var(--warn)`, `low` as
  `var(--info)`.
- AC-50 (US-2, P2): The Risk areas block shall draw each risk's icon by its
  `kind` as the design maps it (`screen_pr_detail.jsx:20`), and one fixed
  default icon for any other kind.
- AC-51 (US-2, P1): While a stored brief has zero risks, the Risk areas block
  shall show "No notable risks flagged.".
- AC-52 (US-3, P1): While a brief is stored, the PR Brief section shall show a
  full-width "Review focus — read these first" block below the grid, with one
  row per entry as `file:line — reason`, in stored order.
- AC-77 (US-3, P2): The Review focus block shall show the number of entries
  beside its label.
- AC-53 (US-3, P2): While a stored brief has zero Review focus entries, the
  Review focus block shall show one line stating that no starting point was
  suggested.
- AC-54 (US-6, P1): While a stored brief's `missing_inputs` is not empty, the
  PR Brief section shall show one line naming each missing input as "Intent",
  "Blast radius" or "Project context documents".
- AC-55 (US-6, P2): While a stored brief's `specs_used` is not empty, the PR
  Brief section shall list those paths.
- AC-56 (US-5, P1): While a brief is stored, the PR Brief section shall show a
  refresh control with the accessible name "Refresh brief".
- AC-57 (US-5, P1): When the user activates the refresh control, the PR Brief
  section shall send one generation request.
- AC-58 (US-5, P1†): While a refresh is pending, the PR Brief section shall
  keep the current brief visible.
- AC-59 (US-1, P1†): If a generation request fails, then the PR Brief section
  shall show the API's error message.
- AC-75 (US-1, P1†): If a generation request fails, then the PR Brief section
  shall enable the generate or refresh control again.
- AC-60 (US-5, P1†): If a refresh fails, then the PR Brief section shall keep
  showing the brief it showed before the refresh.
- AC-61 (US-4, P2): While the brief is being read, the PR Brief section shall
  show a skeleton in place of the summary.
- AC-62 (US-4, P2): If reading the brief fails, then the PR Brief section
  shall show an error state with a retry control.
- AC-63 (US-5, P2): While the brief is stale, the PR Brief section shall show
  "Stale — the PR has changed since this was generated" beside the refresh
  control.
- AC-64 (US-4, P2): While a read reports `generating: true`, the PR Brief
  section shall read the brief again at least once every 4 seconds.
- AC-78 (US-4, P2): While a read reports `generating: true`, the PR Brief
  section shall show the same generating state as AC-42.
- AC-65 (US-1, P2): While a brief is stored, the PR Brief section shall show
  the model slug and the cost of its generation.

### Navigation to Files changed

- AC-66 (US-3, P1): When the user activates a Review focus entry, the PR page
  shall show the Files changed tab.
- AC-67 (US-3, P1): While Files changed shows Smart order, when it opens with
  a target file, the tab shall expand the role group that contains the file.
- AC-68 (US-3, P1): When Files changed opens with a target file, the tab shall
  expand that file's card, whatever its size.
- AC-69 (US-3, P1): When Files changed opens with a target file, the tab shall
  scroll that file's card into view.
- AC-70 (US-3, P1†): While Files changed shows Original order, when it opens
  with a target file, the tab shall show that file's card expanded and in view
  in the flat list.
- AC-71 (US-3, P2): While the target line is rendered in the file's diff, when
  Files changed opens with that target, the tab shall show that line marked
  and in view.
- AC-72 (US-3, P2): If the target line is not rendered in the file's diff,
  then the tab shall scroll to the file's card and mark no line.
- AC-73 (US-3, P1†): If the target file is not among the PR's current files,
  then the Files changed tab shall open with no target and show a notice
  naming the path.
- AC-74 (US-3, P2): When a Review focus entry is activated, the page URL shall
  identify the Files changed tab, the target file and the target line, so
  that a reload shows the same target.

### Default model

- AC-81 (US-1, P1†): The feature-model registry shall give `risk_brief` the
  default provider `openrouter` and the default model
  `anthropic/claude-haiku-4.5`.
- AC-82 (US-1, P1†): The file `contracts/platform.ts` shall be byte-identical
  in the two vendored copies of `@devdigest/shared`.
- AC-83 (US-1, P2†): While the workspace has chosen no `risk_brief` model, the
  Settings models section shall show `anthropic/claude-haiku-4.5` for Risk
  Brief.

### Demo seed

PR #482 is seeded with four changed files and these new-side ranges:
`src/middleware/ratelimit.ts` 1–84, `src/api/public/webhooks.ts` 1–39,
`src/config.ts` 8–15, `src/api/users.ts` 42–52 (`server/src/db/seed.ts:32-37`,
`server/src/db/seed-diffs.ts:23,113,161,172`).

- AC-89 (US-4, P2†): When the seed runs and PR #482 has no stored brief, the
  seed shall store a brief for PR #482.
- AC-90 (US-4, P2†): If PR #482 already has a stored brief when the seed runs,
  then the seed shall leave that brief unchanged.
- AC-91 (US-4, P2†): The seeded brief shall carry the head SHA that PR #482's
  row holds when the seed runs.
- AC-92 (US-2, P2†): The seeded brief shall hold the two risks of the design
  fixture whose file is seeded, "Auth surface touched" and "Adds Redis
  round-trip per request", with the fixture's kind, severity, explanation and
  file reference (`.context/docs/design/src/data.jsx:43,45`).
- AC-93 (US-3, P2†): The seeded brief shall hold, in this order, the three
  Review focus entries of screenshot 2 that lie in a seeded changed range,
  `src/config.ts:12`, `src/middleware/ratelimit.ts:52` and
  `src/api/users.ts:46`, each with the screenshot's reason.
- AC-94 (US-1, P2†): The seeded brief shall hold a fixed summary of at most
  400 characters that shares no sentence with the seeded review's summary
  (`server/src/db/seed.ts:183-184`).
- AC-95 (US-6, P2†): The seeded brief shall list `blast` and `specs` in
  `missing_inputs`.

### Browser flow

- AC-96 (US-1, P2†): The brief flow shall observe, on the Overview tab of PR
  #482, the seeded summary, one seeded risk title and one seeded Review focus
  entry.
- AC-97 (US-4, P2†): When the brief flow reloads the page, it shall observe
  the seeded summary and no "Generate brief" button.
- AC-98 (US-3, P2†): When the brief flow activates the seeded entry
  `src/config.ts:12`, it shall observe the Files changed tab in the URL and
  the content of the `src/config.ts` diff.

### How the outcomes are observed

- AC-11 and AC-7: against the mock model provider, a generation records one
  structured-completion call and no other model call; a read records none.
- AC-13 to AC-20 and AC-88: the recorded request's messages are inspected.
- AC-3 and AC-82: `diff -r client/src/vendor/shared server/src/vendor/shared`
  reports neither `contracts/brief.ts` nor `contracts/platform.ts`.
- AC-81: the existing assertion of the `risk_brief` default
  (`server/test/settings-models.it.test.ts:70`) holds the new value.
- AC-92 and AC-93: the seeded brief passes the grounding rules of AC-26 to
  AC-30 against the seeded patches, checked in the unit lane beside the other
  seed fixtures (`server/test/seed-fixtures.test.ts`).
- AC-96 to AC-98: one deterministic flow on the hermetic e2e stack. That
  stack has no model key (`e2e/README.md:5`), so the summary seen after the
  reload cannot come from a new generation.
- Seeded PR #482 shows AC-54 as soon as it is opened (AC-95). The other
  seeded PRs have no brief and show the empty state (AC-38).
- The demo PR follows the lesson's guidance: intent and blast active, a
  high-risk change (configuration, a new dependency, a shared helper or a
  migration) and one attached document. That shows AC-17, AC-18, AC-24 and
  AC-55.

## Edge cases

| Case | Expected behaviour | AC, non-goal or marker |
|---|---|---|
| Head SHA moved after generation | The stored brief is served as it is and marked stale; nothing regenerates | AC-8, AC-63, non-goal (auto-regenerate) |
| Refresh on a stale brief | A new brief replaces the stored one and carries the current head SHA | AC-4, AC-5 |
| A stale brief names a file the PR no longer has | The click opens Files changed with a notice | AC-73 |
| No stored intent | Generated without it; the section says so; no intent is derived | AC-11, AC-21, AC-54 |
| The stored intent is itself stale | Used as stored; the Intent card shows its own stale note | AC-16, non-goal (staleness of inputs) |
| Repository not indexed, index failed or indexing off | Blast is missing; generated without it; the section says so | AC-22, AC-54 |
| Index partial, with symbols | Blast is available and used; the Blast radius card shows its own notice | AC-17 |
| Blast `ok` with zero symbols (configuration-only PR) | Blast is available; the summary line is sent | AC-17 |
| No attached document, no clone, or every document missing or over budget | Generated without documents; the section says so | AC-19, AC-23, AC-54 |
| All three inputs missing | Generated from title, description and file statistics | AC-13, AC-14, AC-21 to AC-23 |
| No model picked for `risk_brief` | The registry default is used: `openrouter` / `anthropic/claude-haiku-4.5` | AC-12, AC-81 |
| A workspace picked a `risk_brief` model before the default moved | Its choice is kept | AC-12 |
| The resolved provider has no API key | The request fails with the missing key named; nothing is stored | AC-33, AC-76, AC-34, AC-59, AC-75 |
| The model returns more than 6 risks, more than 6 Review focus items or a summary over 400 characters | The output is invalid; the adapter reprompts inside the one request; if it is still over a cap the generation fails and nothing is stored | AC-84 to AC-87, AC-34 |
| Grounding leaves fewer entries than the cap | The brief holds what is left; nothing is added | AC-26 to AC-29 |
| A brief and a review both exist | The banner shows the review's summary; the summary block below it shows the brief's | AC-45, AC-46 |
| A brief exists and no review | The "Not reviewed yet" note, then the summary block | AC-45, AC-47 |
| A review exists and no brief | The banner, then the empty state with "Generate brief" | AC-46, AC-79 |
| Neither exists | The "Not reviewed yet" note, then the empty state | AC-47, AC-79 |
| Install seeded before this change, seed run again | PR #482 has no brief row, so the seed adds one; every other seeded row is left alone | AC-89 |
| Install seeded before this change, seed not run again | PR #482 shows the empty state; the user can generate | AC-38 |
| The user generated or refreshed a brief on PR #482, then the seed runs | The user's brief is kept | AC-90 |
| The seeded brief's JSON shape is changed by a later release | A row already seeded keeps the old JSON and is read as no brief if it no longer fits the contract; the seed does not rewrite it | AC-10, AC-90 |
| Design fixture entries that cannot ground on the seeded files: the risk "New dependency: ioredis" (`package.json` is not seeded) and the entry `src/api/public/webhooks.ts:61` (the seeded range ends at 39) | Left out of the seeded brief | AC-92, AC-93, non-goal (extending the seeded patches) |
| Provider error, timeout, or output still invalid after the adapter's own reprompts | 502 `brief_failed`; the previous brief stays | AC-33, AC-34, AC-60 |
| The model names a file outside the PR | The entry or reference is removed and counted | AC-26, AC-28, AC-31 |
| The model names a line outside the changed ranges | Review focus entry omitted; a risk reference keeps its path | AC-27, AC-30 |
| A changed file has no stored patch (binary or too large) | It has no changed range, so no Review focus entry can name it | AC-15, AC-27 |
| Every risk is removed, or the model returns none | "No notable risks flagged." | AC-29, AC-51 |
| Every Review focus entry is removed | The block says no starting point was suggested | AC-53 |
| Double click on Generate or refresh | The control is disabled after the first click; one request is sent | AC-41, AC-42 |
| Two generation requests reach the API together | The second gets 409 and no second model call is made | AC-36 |
| Reload while a generation is running | The section shows the generating state, then the brief | AC-37, AC-64, AC-78 |
| API restarted during a generation | Nothing is stored; the section shows its empty state | AC-34, AC-38 |
| PR with zero changed files | 422 `brief_no_files`; no model call | AC-35 |
| Brief stored before a contract change | Read as no brief; the user generates again | AC-10 |
| Target file sits in a collapsed group (docs, boilerplate: `DiffTab/constants.ts:41,47`) or is larger than 200 changed lines (`diff-viewer/constants.ts:4`) | Group and card are expanded | AC-67, AC-68 |
| Smart Diff read failed, so the flat list is shown (`DiffTab.tsx:48`) | The card in the flat list is the target | AC-70 |
| The user switches order after arriving | The target is not applied again | non-goal (order in the URL) |
| Target line is on the old side only, or in an unrendered part of the file | The file is shown; no line is marked | AC-72 |
| Very long summary, reason or path | Text wraps or truncates inside the card | NFR-6 |
| The maximum: 6 risks and 6 Review focus entries | Every stored entry is listed | AC-48, AC-52, AC-85, AC-86 |
| The existing hint "Run a review or open the PR to compute it." (`brief.json:12`) | It is false for a brief generated by a button, so it is not shown with that wording | AC-38, NFR-5 |

## Non-functional requirements

- NFR-1 (cost): Generation requests are limited to 10 per minute, the limit
  the intent derivation uses (`server/src/modules/intent/routes.ts:38`).
- NFR-2 (integrations): Reading or generating a brief makes zero GitHub
  requests.
- NFR-3 (contracts): Each brief route validates its response against a shared
  contract, and declares 404, 422, 500 and its own error codes (root
  `INSIGHTS.md`, 2026-09-20).
- NFR-4 (observability): Each generation writes one log line with the PR id,
  the model slug, input and output tokens, cost, `missing_inputs` and the
  `dropped` counts.
- NFR-5 (copy): Every string the feature shows comes from the `brief` message
  namespace, and every key that the Intent and Blast radius cards read from it
  keeps its text (`client/.context/insights/INSIGHTS.md`, 2026-09-21).
- NFR-6 (layout): At a 1080 px content width no summary, risk, reason or path
  overflows its card; a truncated path shows its full text on hover.
- NFR-7 (accessibility): The generate control, the refresh control and each
  Review focus entry are reachable by Tab and activated by Enter, and each
  risk's severity is available as text, not by colour alone.
- NFR-8 (e2e): The brief flow uses deterministic commands only and needs no
  model key (`e2e/README.md:5,33`).
- NFR-9 (e2e): The five existing flows that open PR #482 (02, 04, 05, 10, 12)
  pass with their steps unchanged.
- NFR-10 (e2e): `e2e/.context/docs/seed-contract.md` lists each seeded value
  the brief flow waits for.

## External contracts

```
GET  /pulls/:id/brief  → 200 { brief: <brief record> | null, generating: boolean }
                         404 unknown PR
POST /pulls/:id/brief  → 200 <brief record>
                         404 unknown PR · 409 brief_in_progress
                         422 brief_no_files · 502 brief_failed
```

The brief record is `PrBrief` plus generation data:

| Field | Type | Note |
|---|---|---|
| `summary` | string | New in `PrBrief` (AC-1) |
| `intent` | `Intent` or null | What the model was told; null when missing (AC-2) |
| `blast` | `BlastRadius` or null | What the model was told; null when missing (AC-2) |
| `risks` | `Risks` | Unchanged shape (`brief.ts:129-141`), after grounding |
| `review_focus` | list of `{ file, line, reason }` | New in `PrBrief` (AC-1), after grounding |
| `history` | `PrHistory` | Always `{ history: [] }` (non-goal) |
| `pr_id` | uuid | |
| `head_sha` | string | Stored inside the JSON (AC-4) |
| `generated_at` | ISO timestamp | |
| `model`, `tokens_in`, `tokens_out`, `cost_usd` | string, integer, integer, number or null | AC-25 |
| `missing_inputs` | list of `intent`, `blast`, `specs` | AC-21 to AC-23 |
| `specs_used` | list of paths | AC-24 |
| `dropped` | `{ risks: integer, review_focus: integer }` | AC-31 |
| `stale` | boolean | Computed on read, never stored (AC-8) |

A risk's `file_refs` item is `path`, `path:line` or `path:start-end`
(`.context/docs/design/src/data.jsx:43-45`).

The caps of AC-84 to AC-86 belong to the schema the model's output is
validated against. The stored `PrBrief` contract carries no cap, so a later
change of a cap never invalidates a stored brief.

The feature-model registry entry for `risk_brief` (`contracts/platform.ts`,
both copies) changes its default from `openai` / `gpt-4.1` to `openrouter` /
`anthropic/claude-haiku-4.5`. Its id, label and description stay.

## Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | A brief is generated only by the generate and refresh controls; a read never generates. | US-1, US-4, US-5; the same rule as intent (spec 07 D2, `intent/service.ts:44`). |
| D2 | Stale means the head SHA changed. A stale brief is served and marked, never regenerated automatically. | The lesson stores the SHA in the JSON; the Intent card already works this way (`brief.json:39`); automatic regeneration would spend money with no user action. |
| D3 | "Exactly one model call" means one structured-completion request. The adapter's reprompts on invalid output happen inside that request (`server/src/vendor/shared/adapters.ts:53,63,79`). | The lesson names `completeStructured` and its re-query behaviour. |
| D4 | The Intent and Blast radius cards stay as they are and keep reading their own routes. `PrBrief.intent` and `PrBrief.blast` record what the model was told. | Both cards ship (`OverviewTab.tsx:47-50`); the lesson keeps the four `PrBrief` fields and adds two. |
| D5 | A risk with no grounded file reference is omitted. | The lesson: "specific PR risks, each linked to a file"; US-2. |
| D6 | A failed generation changes nothing stored. | Intent does the same (spec 07 D9, `intent/repository.ts:66-68`). |
| D7 | Review focus keeps the model's order; nothing re-sorts it. | The lesson: "in recommended reading order". |
| D8 | The label is "Risk areas", not the existing "Risks" (`brief.json:5`). | Design `screen_pr_detail.jsx:73`; no code reads `block.risks` today. |
| D9 | The only facts that carry line numbers to the model are the changed ranges; findings of a review are not sent, and `line` stays required (AC-15, AC-27). | User, 2026-10-03 (Q1, option A). It needs no review and keeps the lesson's input list. |
| D10 | A brief reads every document the Project Context page counts as used by at least one agent for the PR's repository (AC-18, AC-19). | User, 2026-10-03 (Q2, option A). A brief has no agent of its own (`project-context/routes.ts:14-19`). |
| D11 | The banner keeps the review's summary. The brief's summary is its own block in the brief stack, between the banner and the grid (AC-45 to AC-47, AC-79). | User, 2026-10-03 (Q3, option B). The stack order follows the design's `BriefCard` column (`screen_pr_detail.jsx:66-68`); a verdict then never sits above text about purpose. |
| D12 | The refresh control sits in the summary block, not in the banner where screenshot 2 draws it (AC-80). | It follows from D11: the banner belongs to the review and is absent when no review exists (`OverviewTab.tsx:44-46`), while the control must be there whenever a brief is. |
| D13 | The `risk_brief` default moves to `openrouter` / `anthropic/claude-haiku-4.5` in both contract copies (AC-81, AC-82). It must not be `deepseek/deepseek-v4-flash`. | User, 2026-10-03 (Q4). Spec 07 D12 did the same for intent: a default is what runs, on a key the install already needs. The slug is the OpenRouter one (`contracts/platform.ts:83-85`). |
| D14 | Caps: summary 400 characters, 6 risks, 6 Review focus items, in the output schema only (AC-84 to AC-88). Output over a cap is invalid output. **These three numbers are assumptions the user can adjust.** | User, 2026-10-03 (Q6): cap in the output schema, sizes left open, about 6 and 6 offered. 400 characters is about three lines of the summary block at the 1080 px content width; the screenshot's banner text is about 180 characters. |
| D15 | A risk's file reference does not navigate. | User, 2026-10-03 (Q7, not selected). |
| D16 | A Review focus click adds no browser history entry. | User, 2026-10-03 (Q8, not selected). |
| D17 | PR #482 gets a seeded, hand-authored brief, insert-only, holding the design fixture's entries that ground on the seeded files; one browser flow covers it (AC-89 to AC-98). | User, 2026-10-03 (Q5). Insert-only is the intent seed's rule (`server/src/db/seed-intent.ts:113-115`); the seed skips rows that exist (`server/.context/insights/INSIGHTS.md`, 2026-09-21). |
| D18 | The seeded brief lists `blast` and `specs` as missing (AC-95). | The seeded repository has no clone (`e2e/.context/docs/seed-contract.md:19-20`), so a real generation there would have neither. |

## Starter claims checked against this fork

| Lesson claim | In this tree |
|---|---|
| `getIntent(prId)` in `server/src/modules/reviews/repository.ts` | **False.** `reviews/repository.ts:8` says `pr_intent` moved. The read is `IntentRepository.get` (`intent/repository.ts:60`), served by `IntentService.get` (`intent/service.ts:45`) through `container.intent` (`platform/container.ts:153`). The record also carries `confidence`, `sources`, `head_sha` and `stale`. |
| `GET /pulls/:id/blast` returns `summary` and callers | True (`blast/routes.ts:23`). **Differs:** it returns `BlastRadiusResponse`, which adds `status`, `degraded_reason`, `index_sha`, `stats` and `truncated` (`brief.ts:115-122`). The blast service has no container getter (`blast/routes.ts:17`). |
| `GET /pulls/:id` returns `files[]` with `additions` and `deletions` | True (`contracts/platform.ts:192-197`). **Differs:** that route refetches from GitHub and rewrites `pr_files` (`pulls/routes.ts:238-250`). Roles come from `GET /pulls/:id/smart-diff`, with no model (`smart-diff/service.ts:30`). |
| Specs are "attached to the reviewer" | **Differs.** A document is attached to one agent or one skill, for one repository (`project-context/routes.ts:14-19`). A brief has no agent, and the run-time reader needs one (`project-context/service.ts:50-54`). Settled by D10. |
| `contracts/brief.ts` is identical in both copies and has `Intent`, `Risk`, `Risks`, `PrBrief` | True. `PrBrief` (`brief.ts:196-201`) requires all four fields, so it cannot hold a brief without intent or blast. No route uses it; only `client/src/lib/types.ts:35` imports it. |
| `pr_brief` has `pr_id` and `json` | True (`db/schema/reviews.ts:101-106`). Nothing reads or writes it. |
| `completeStructured` is how reviews work in `server/src/modules/reviews/` | **Differs.** The review's call is in `reviewer-core/src/review/run.ts:186`. The server's own direct caller is `modules/conventions/service.ts:145`. |
| `Risk Brief` (`risk_brief`) exists in Settings and `resolveFeatureModel` reads it | True (`contracts/platform.ts:18,62-67`, `settings/feature-models.ts:51`). **Differs:** nothing reads it yet, and its default is `openai` / `gpt-4.1` while all six agents in the running install use `openrouter` (live `list_agents`). Without an OpenAI key the default fails (`platform/container.ts:232`). This spec moves the default (D13, AC-81). |
| `brief.json` has `block.intent`, `block.blast`, `block.risks`, `noRisks`, `unavailable`, `unavailableHint` | True. **Differs:** `block.risks` reads "Risks"; `unavailableHint` describes automatic computation; there is no text for generate, generating, refresh, Review focus, stale, error or missing inputs. `brief` is already in `USED_NAMESPACES` (`client/src/app/layout.tsx:25`). |
| `VerdictBanner` is on the Agent runs tab and can be reused on Overview | **Already done.** It is on Overview, showing the newest review's summary, or "Not reviewed yet" (`OverviewTab.tsx:31-46`). |
| Intent and Blast radius blocks, "if present in the fork" | Both present (`OverviewTab.tsx:47-50`). |
| Missing: `brief/` module, routes, button, blocks, navigation | True (`modules/index.ts:30-45`). Files changed has no target today: the tab key is `diff` (`PrDetailHeader.tsx:118`), order is local state, and tab changes replace the URL (`page.tsx:75`). |

## Design against the lesson

| Subject | Design source | Screenshot | Lesson | This spec |
|---|---|---|---|---|
| Review focus block | Absent from `BriefCard` (`screen_pr_detail.jsx:65-80`) | Full-width block with a count, below the grid | Mandatory | AC-52, from the screenshot |
| Generate button and the empty, loading, error and stale states | Absent | Absent | Button mandatory | AC-38, AC-42, AC-59, AC-61 to AC-63; no artboard exists |
| Refresh control | Absent | Icon in the banner, left of the score | Mandatory | AC-56; placed in the summary block, not the banner (AC-80, D12) |
| Banner text | The review's summary (`findings.jsx:93`) | The review's summary | The brief's summary | The banner keeps the review's summary, as the design draws it; the brief's summary gets its own block below the banner, which neither the design nor the screenshot shows (AC-45, AC-46, D11). The lesson's placement is not followed; its requirement that the summary is shown is |
| Seeded brief for PR #482 | 3 risks (`data.jsx:42-46`) | 4 Review focus entries | — | 2 risks and 3 entries: the rest name a file or line the seed does not hold (AC-92, AC-93) |
| List sizes | 3 risks | 3 risks, 4 entries | Not stated | At most 6 and 6; summary at most 400 characters (D14) |
| Verdict and score | Drawn | Drawn | P3 | Already shipped; non-goal |
| Risk row | Pill with icon and title; file refs only after expanding (`:27-36`) | Title with the file ref beneath, and a chevron | Name and file mandatory; expanding is P3 | AC-48; expanding is a non-goal |
| Prior PRs | Accordion (`:53-63`) | Drawn | P3 | Non-goal |
| Files changed tab key | `files` (`:159`) | — | — | The fork's key `diff` |
| Cost under the score | The review's cost (`findings.jsx:97-99`) | Drawn | Not mentioned | The brief's own cost has no design; AC-65 |

## Inputs and provenance

| Input | Provenance | Note |
|---|---|---|
| PR title and description | `[reused: stored PR row]` | No GitHub call (NFR-2) |
| Changed files: path, additions, deletions | `[reused: stored PR files]` | Keyed by path |
| Smart Diff role per file | `[deterministic: Smart Diff classification]` | Spec 08 |
| Changed ranges per file | `[deterministic: hunk headers of stored patches]` | Numbers only, no code (AC-20); D9 |
| Intent sentence and scope lists | `[reused: L03 intent]` | Stored row only; never derived here |
| Blast summary, changed symbols, caller files | `[deterministic: repo-intel]` | Spec 10; missing when not available |
| Attached documents | `[reused: Project Context attachments]`, text `[deterministic: read from the clone]` | SPEC-11; D10 |
| Seeded brief of PR #482 | `[deterministic: hand-authored seed fixture]` | No model call at seed time (D17) |
| PR head SHA | `[reused: stored PR row]` | Stored in the brief; drives `stale` |
| Provider and model | `[reused: Settings, risk_brief]` | Registry default otherwise (D13) |
| Summary, risks, Review focus | `[new: 1 LLM call]` | Per generation or refresh |

## Untrusted inputs

- **PR title and description** are written by the PR author. They are data,
  never instructions. In the generation request they sit inside the same kind
  of untrusted delimiter block the review prompt uses.
- **File paths, symbol names and caller files** come from the repository. They
  are data. Where they enter the request, characters that could close or forge
  a delimiter or start a new line are removed. In the UI they render as text.
- **Intent text** is model output derived from untrusted text. It is data in
  the request, inside a delimiter block.
- **Attached document text** comes from repository files. It is data, never
  instructions, inside a delimiter block under its path. A document can add
  context; it cannot tell the model to drop a risk.
- **Model output** (summary, risk titles, explanations, reasons, file
  references) is data. It is validated against the output schema, grounded
  against the PR's changed files (AC-26 to AC-30) and rendered as plain text.
  It is never rendered as HTML and never sent to a model by this feature.
- **A file reference from the model** is used for navigation only after it
  matches a changed file exactly. It is never used to read a file from disk.
- **MCP**: no tool returns the brief in this feature.

## Open questions

None.

Q1 to Q8 were answered by the user on 2026-10-03 and are recorded as D9 to
D17. The three cap sizes in D14 are assumptions the user can adjust without
reopening a question.
