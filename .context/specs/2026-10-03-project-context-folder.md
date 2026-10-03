# Spec: Project Context Folder
Spec ID: SPEC-11
Status: implemented
Supersedes: —

## Problem and user

The person who configures reviewer agents has project knowledge written down in
the repository: specs, docs and insights in Markdown. Today a reviewer never
sees it. The prompt has a `## Project context` slot
(`reviewer-core/src/prompt.ts:210`) and the trace has a `specs_read` field
(`server/src/vendor/shared/contracts/trace.ts:92`), but the run executor always
sends nothing (`server/src/modules/reviews/run-executor.ts:319`). So a rule
such as "the `api/` module must not directly import `db/`" cannot be enforced
by a review, and there is no way to see whether written context changes what a
reviewer reports.

This is the first L05 feature because it is small and shows at once whether
context affects the reviewer: the user picks the documents by hand, runs a
review, and reads in the trace what was sent.

Terms used below, each with one meaning:

- **Document**: a Markdown file in a repository's clone that matches the search
  pattern.
- **Owner**: an agent or a skill.
- **Attachment**: a stored link between one owner, one repository and one
  document path. It holds no document text. An owner's attachments keep the
  order in which they were attached.
- **Active repository**: the repository selected in the sidebar
  (`client/src/components/app-shell/hooks/useShellContext.ts:27`).
- **Inherited document**: a document attached to a skill, as seen by an agent
  that uses the skill.
- **Injected**: the document's text was placed in the prompt.
- **Skipped**: an attached document was not injected; the reason is `missing`
  or `over_budget`.
- **Context budget**: the maximum total token count of injected documents in
  one prompt.

## Goals / Non-goals

**Principle (MVP).** This feature exists to test one idea: whether attached
context changes the reviewer's output. When two designs both satisfy an
acceptance criterion, the one with the smaller diff wins.

Goals

- G1. The user can find every spec, doc and insight Markdown file in a
  repository and read it.
- G2. The user can attach documents to an agent, per repository.
- G3. The user can attach documents to a skill; agents using the skill inherit
  them.
- G4. Before a run, the user sees how many tokens the documents checked in a
  tab add to a prompt.
- G5. At run start the attached documents are read from the repository and
  injected into the prompt as untrusted text, with no extra LLM call.
- G6. After a run, the user sees which documents were read, their token sizes,
  which were skipped and why, and the full text that was sent.
- G7. A reviewer can name the document a finding relies on.

Non-goals

- Automatic, content-based selection of documents for a PR. It is a separate
  feature.
- Reordering attachments. Images 8 and 9 draw drag handles and the copy "Order
  matters"; documents are injected in the order they were attached, with no
  drag, no keyboard move and no reorder request.
- Listing or counting inherited documents in the agent Context tab. Its token
  total covers the documents checked in that tab; the run trace gives the exact
  per-run figure.
- A budget indicator in the Context tabs, and a label naming the repository the
  tab lists.
- Editing a document, creating a file or folder, and uploading, on the Project
  Context page (drawn at `screen_tour_context.jsx:113-114,125`).
- The Coverage ring and the "Indexed: N files · N chunks" footer
  (`screen_tour_context.jsx:120,128`), and any embedding or chunking of
  documents.
- An attach control on the Project Context page. Attaching happens only in the
  agent and skill Context tabs.
- Reading a document from the PR head. Only the default-branch tree is read.
- Truncating a document to fit the budget. A document is injected whole or not
  at all.
- A new field on `Finding` for a document reference.
- New or changed MCP tools. `run_agent_on_pr` gains the behaviour through the
  run executor; `list_agents` output is unchanged.
- Pagination or a count cap for the document list.
- Changing what the trace of a failed or cancelled run records
  (`run-executor.ts:461-495`).
- The Evals, Stats and CI tabs shown beside Context in the screenshots.

## User stories

- US-1: As an agent author, I want to browse and read every Markdown document
  in a repository, so that I know what I can give a reviewer.
- US-2: As an agent author, I want to attach documents to an agent, so that its
  reviews use the project's own rules.
- US-3: As a skill author, I want to attach documents to a skill, so that every
  agent using the skill gets them.
- US-4: As an agent author, I want to see the token size of what I attach, so
  that I know the cost added to each prompt.
- US-5: As an agent author, I want the run trace to show the documents read,
  their sizes, the ones skipped and the exact text sent, so that I can check
  what the reviewer saw.
- US-6: As a PR author, I want a finding that rests on a project rule to name
  the document that states it, so that I can read the rule.

## Acceptance criteria (EARS)

Document reader (API)

- AC-1 (US-1): The document reader shall list every file in the repository's
  clone whose repo-relative path matches the configured search pattern, whose
  default is `**/{specs,docs,insights}/**/*.md`.
- AC-2 (US-1): The document reader shall match directories whose names begin
  with a dot, such as `.context/`.
- AC-3 (US-1): The document reader shall omit files under the directories the
  repository indexer excludes
  (`server/src/modules/repo-intel/constants.ts:17-26`).
- AC-4 (US-1): The document reader shall read the clone's working tree on the
  repository's default branch.
- AC-5 (US-1, US-4): The document reader shall return for each document its
  repo-relative path, its type and its token count.
- AC-6 (US-1): The document reader shall set a document's type to the name of
  the nearest `specs`, `docs` or `insights` directory above the file, and to
  `other` where its path contains none of them.
- AC-7 (US-4): When a document list or a document's content is requested, the
  document reader shall compute each token count from the file's content at
  that moment.
- AC-8 (US-4, US-5): The API shall report the same token count for the same
  document content in the document list and in the run trace.
- AC-9 (US-1): While the repository has no clone, the document reader shall
  return an empty list with the status `not_cloned`.
- AC-10 (US-1): If a matching path resolves outside the repository's clone,
  then the document reader shall omit it from the list.
- AC-11 (US-1): If a document's content is requested for a path that is not in
  the repository's current document list, then the API shall respond 404 and
  return no file content.

Project Context page

- AC-12 (US-1): The sidebar shall show a "Project Context" entry in the
  Workspace group that opens the Project Context page of the active repository.
- AC-13 (US-1): The Project Context page shall list every document of the
  repository with its repo-relative path and its type badge.
- AC-14 (US-1): When the user selects a document, the Project Context page
  shall show the document's current content rendered as Markdown, read-only.
- AC-15 (US-1): While a document is selected, the Project Context page shall
  show "Used by N agents", where N is the number of agents that would receive
  the document in a run on this repository, directly or through a linked,
  enabled skill.
- AC-16 (US-1): When the user activates refresh, the Project Context page shall
  reload the document list from the clone as it is on disk, without fetching
  from the remote.
- AC-17 (US-1): While the document list is loading, the Project Context page
  shall show a loading state.
- AC-18 (US-1): If the document list request fails, then the Project Context
  page shall show an error message in place of the list.
- AC-19 (US-1): While the repository has a clone and zero documents, the
  Project Context page shall show an empty state that names the search pattern.
- AC-20 (US-1): While the repository has no clone, the Project Context page
  shall show a state saying the repository is not cloned.

Context tab (agent editor and skill editor)

- AC-21 (US-2): The agent editor shall show a "Context" tab after "Skills".
- AC-22 (US-3): The skill editor shall show a "Context" tab after "Config".
- AC-23 (US-2, US-3): A Context tab shall list the active repository's
  documents, each with a checkbox, its file name, its directory, its type badge
  and a Preview control.
- AC-24 (US-2, US-3): When the user checks a document, the API shall store an
  attachment for that owner, the active repository and that path.
- AC-25 (US-2, US-3): When the user unchecks a document, the API shall delete
  that attachment.
- AC-26 (US-2, US-3): The API shall store for an attachment its owner, its
  repository and its path, and no document text.
- AC-27 — removed (reordering is a non-goal).
- AC-28 — removed (reordering is a non-goal).
- AC-29 (US-2, US-3): When the user types in the filter box, a Context tab
  shall show only the documents whose path contains the typed text, ignoring
  case.
- AC-30 (US-2, US-3): When the user activates Preview on a row, a Context tab
  shall show that document's current content, read-only.
- AC-31 (US-2): The agent Context tab shall show the heading "Project context"
  with the badge "N of M attached", where N is the agent's attached documents
  found in the active repository and M is the documents found.
- AC-32 (US-3): The skill Context tab shall show the heading "Project context
  to use" with the badge "N attached".
- AC-76 (US-3): The skill Context tab shall show the sentence "Any agent using
  this skill inherits these documents."
- AC-33 (US-4): A Context tab shall show "≈ T tokens", where T is the sum of
  the token counts of the documents checked in that tab.
- AC-34 (US-4): When the user checks or unchecks a document, a Context tab
  shall update T without a page reload.
- AC-35 — removed (inherited rows are a non-goal).
- AC-77 — removed (inherited rows are a non-goal).
- AC-36 (US-2): The agent Context tab shall state that the attached documents
  are injected as an untrusted `## Project context` block into runs on the
  active repository's pull requests.
- AC-37 (US-3): While at least one document is attached, the skill Context tab
  shall show a "Serializes as" box containing `## Project specifications`
  followed by one `- <path>` line per attached document, in the order they were
  attached.
- AC-38 (US-2, US-3): If an attached path is no longer in the repository's
  document list, then a Context tab shall show its row marked as missing, with
  a control to detach it.
- AC-39 (US-2, US-3): While no repository is active, a Context tab shall show a
  state asking the user to select a repository.
- AC-40 (US-2, US-3): While the active repository has no clone, a Context tab
  shall show a state saying the repository is not cloned.
- AC-41 (US-2, US-3): If an attach request names a path that is not in the
  repository's current document list, then the API shall respond 422 and store
  nothing.
- AC-42 — removed (the checkbox cannot attach a path twice, and AC-49 removes
  duplicates at run time).
- AC-43 (US-2, US-3): When an attachment is added or removed, the API shall
  leave the owner's version number unchanged.
- AC-44 (US-2, US-3): When an agent, a skill or a repository is deleted, the
  API shall delete the attachments that refer to it.
- AC-45 — removed (the budget indicator is a non-goal).
- AC-75 — removed (the repository label is a non-goal).

Run

- AC-46 (US-2): When a run starts, the run executor shall read from the clone
  of the PR's repository each document attached to the run's agent for that
  repository.
- AC-47 (US-3): When a run starts, the run executor shall also read each
  document attached, for the PR's repository, to a skill that is linked to the
  agent and enabled.
- AC-48 (US-2, US-3): The run executor shall order the documents as the agent's
  own in the order they were attached, then each skill's in skill link order
  and, within a skill, in the order they were attached.
- AC-49 (US-3): If a path occurs more than once in that order, then the run
  executor shall keep its first occurrence only.
- AC-50 (US-2): The run executor shall inject each kept document's text into
  the prompt's `## Project context` section inside its own untrusted delimiter
  block.
- AC-51 (US-6): The review prompt shall identify each injected document by its
  repo-relative path, in place of the positional `spec-N` label
  (`reviewer-core/src/prompt.ts:187`).
- AC-52 (US-6): The `## Project context` section shall carry a fixed
  instruction telling the reviewer to name a document's path in the rationale
  of any finding that relies on that document.
- AC-53 (US-2): The review prompt shall place `## Project context` after
  `## Repo skeleton` and before `## Callers of changed symbols`.
- AC-54 (US-3): The review prompt shall add, to the section of each skill that
  has injected documents, `## Project specifications` followed by one
  `- <path>` line per injected document attached to that skill.
- AC-55 (US-5): If an attached document is not in the current document list of
  the PR's repository, then the run executor shall skip it with the reason
  `missing`.
- AC-78 (US-5): If one or more attached documents are skipped, then the run
  executor shall complete the run with the remaining documents.
- AC-56 (US-4): The run executor shall inject documents in order while the sum
  of their token counts stays within the context budget, whose default is
  8,000 tokens and which is one server-wide configurable setting.
- AC-57 (US-4): If a document would take that sum past the context budget, then
  the run executor shall skip it and every later document with the reason
  `over_budget`.
- AC-58 (US-2): The run executor shall inject a document's text whole or not at
  all.
- AC-59 (US-2): While a run has no document to inject, the review prompt shall
  be byte-identical to the prompt of the same run before this feature.
- AC-60 (US-2): The run executor shall make no LLM call to read, select or
  count documents.
- AC-61 (US-2): While a run reviews the diff file by file, the run executor
  shall put the same `## Project context` section in every per-file prompt.

Trace and Live Log

- AC-62 (US-5): The run trace shall hold in `specs_read`, for each injected
  document, its path and its token count, each document once.
- AC-63 (US-5): The run trace shall hold, for each skipped document, its path
  and its reason.
- AC-64 (US-5): When documents are injected, the Live Log shall contain one
  line giving their number and their total token count.
- AC-65 (US-5): When a document is skipped, the Live Log shall contain one line
  giving its path and its reason.
- AC-66 (US-5): The trace drawer's "Specs read" row shall list each injected
  document's path with its token count.
- AC-67 (US-5): While the trace holds skipped documents, the trace drawer shall
  list each with its path and its reason.
- AC-68 (US-5): While the run injected at least one document, the trace
  drawer's Prompt assembly section shall show an entry labelled "Project
  context — attached specs (untrusted)".
- AC-69 (US-5): When the user expands that entry, the trace drawer shall show
  the full text of the `## Project context` section as it was sent.
- AC-70 (US-5): The trace drawer shall show the same text for a completed run
  after an injected document is edited or deleted in the repository.
- AC-71 (US-5): The trace drawer shall list the Prompt assembly entries in the
  order the sections have in the prompt.
- AC-72 (US-5): The trace drawer shall open a trace stored before this feature,
  whose `specs_read` is an empty list, without an error.

Client hygiene

- AC-73 (US-1): The web app shall request Project Context data only from routes
  the API serves.

Verification scenario (manual, live model)

- AC-74 (US-6): When an agent with an attached document stating "the `api/`
  module must not directly import `db/`" reviews a PR whose diff adds an import
  of `db/` inside `api/`, the review shall contain a finding on the added
  import line whose rationale names that document's path.

AC-74 needs a real model and a cloned repository, so it is checked by hand and
not in the hermetic lanes. The steps: commit the document under a matching path
on the default branch, resync, attach it to an agent, open a PR that adds the
import, run the review, then read the finding and the trace. The trace must
show the document under "Specs read" (AC-66) and its text under Prompt assembly
(AC-69). The grounding gate still applies: the finding must cite a real line of
the diff, so the document is named in the rationale and not as the finding's
file.

## Edge cases

| Case | Expected behaviour | Covered by |
|---|---|---|
| The PR adds or changes an attached document | The reviewer reads the default-branch version; the PR's version appears only in the diff | AC-4, non-goal (PR head) |
| The clone is behind the remote | Lists and runs use what the clone holds since the last sync | AC-4, AC-16 |
| A document changes between attaching and running | The run reads the current text; the trace reports the actual token count | AC-7, AC-46, AC-62 |
| An attached document was deleted or renamed | Skipped as `missing`; the run continues; the tab shows it as missing | AC-55, AC-78, AC-38 |
| The PR's repository has no clone | Every attachment is skipped as `missing`; the run continues | AC-9, AC-55, AC-78 |
| The agent has attachments only for another repository | Nothing is injected; the prompt is unchanged | AC-46, AC-59 |
| The same document is attached to the agent and to a skill | Injected once, at the agent's position | AC-49 |
| A linked skill is disabled | Its documents are not read | AC-47 |
| The user wants a different order | Detach and attach again; the document moves to the end | AC-48, non-goal (reordering) |
| The agent inherits documents from skills | The tab's total leaves them out; the trace reports every injected document | AC-33, AC-62, non-goal (inherited rows) |
| One document is larger than the whole budget | It and every later document are skipped as `over_budget` | AC-57 |
| The budget would skip a document | The user learns it from the trace and the Live Log after the run, not in the tab | AC-63, AC-65, non-goal (budget indicator) |
| Zero documents attached | No `## Project context` section, no path list, no Prompt assembly entry, "Specs read" shows none (`TraceBody.tsx:55-56`) | AC-59, AC-68 |
| Many documents, or the same file name in several folders (this repo has six `INSIGHTS.md`) | Rows show the directory, so each is told apart; no cap on the list | AC-13, AC-23, non-goal (cap) |
| A path longer than the 80-character label cap (`prompt.ts:31`) | The model still sees the path that tells the document apart; the planner resolves the cap | AC-51 |
| A path containing `<`, `>`, `"` or a line break | It cannot close or forge a delimiter | Untrusted inputs, AC-51 |
| A document tells the reviewer to ignore a defect | The injection guard holds; the defect is still reported | Untrusted inputs |
| A symlinked `.md` pointing outside the clone | Not listed, not readable, not injected | AC-10, AC-11 |
| A request to attach `../x` or a non-Markdown path | Rejected with 422 | AC-41 |
| The search pattern changes after attaching | A path that no longer matches is treated as missing | AC-38, AC-55 |
| Map-reduce run on a large PR | The block is in every per-file call and is listed once in the trace | AC-61, AC-62 |
| The run fails or is cancelled | The trace of that run lists no documents, as today | non-goal (failed runs) |
| The seeded demo repository has no clone (`e2e/.context/docs/seed-contract.md`), so no browser flow can show a document | The flows assert the not-cloned state on seed data; the populated path is covered by the server and component suites | AC-20, AC-40, decision D9 |
| Image 8 says "into every run" | The copy must be true for per-repository attachments and a budget | AC-36 |
| The empty artboard offers "Add a spec file" and names `.devdigest/specs/` (`screen_tour_context.jsx:105`) | No add control; the state names the search pattern | AC-19, non-goal (creating files) |
| The sidebar's repository switch leaves the agent editor (`useShellContext.ts:31-37`) | The user returns to the editor to attach for the new repository | AC-23, non-goal (repository label) |

## Non-functional requirements

- NFR-1: A run with attached documents makes the same number of LLM calls as
  the same run with none.
- NFR-2: Document text is stored in no table except the run trace of a run that
  injected it.
- NFR-3: Document text is sent to no destination other than the LLM provider
  configured for the run's agent.
- NFR-4: No file outside a repository's clone is listed, previewed or injected.
- NFR-5: Every control in the Context tabs and on the Project Context page is
  operable with the keyboard, and each icon-only control has an accessible
  name.
- NFR-6: Every user-facing string added is in a `client/messages/en/` file.
- NFR-7: A change to a shared contract is made in both vendored copies, so that
  `diff -r client/src/vendor/shared server/src/vendor/shared` reports no new
  difference.

## External contracts

Route names are for the plan. The fields are:

| Surface | Fields |
|---|---|
| Document list of a repository | `status`: `ok` \| `not_cloned`; `documents[]`: `path`, `type` (`specs` \| `docs` \| `insights` \| `other`), `tokens`, `used_by_agents` |
| Document content | `path`, `content`, `tokens` |
| Attachments of an owner for a repository | `paths[]`, in the order they were attached |
| Run trace | `specs_read[]`: `path`, `tokens`; `specs_skipped[]`: `path`, `reason` (`missing` \| `over_budget`) |

`prompt_assembly.specs` already holds the injected section text and is stored
with the trace (`run-executor.ts:310`, `reviewer-core/src/prompt.ts:229`), so
AC-69 and AC-70 need no new stored field. Every trace stored today has an empty
`specs_read`, so the change of its item shape breaks none of them (AC-72).

## Inputs and provenance

| Input | Provenance | Note |
|---|---|---|
| File tree of the repository's clone | `[deterministic: filesystem read]` | Default-branch working tree |
| Document text | `[deterministic: file read at request or run start]` | Untrusted |
| Token counts | `[deterministic: tokenizer, no model]` | A counter exists at `server/src/adapters/tokenizer/index.ts:25` |
| Search pattern, context budget | `[deterministic: server configuration]` | Defaults in AC-1 and AC-56 |
| Attachments (owner, repository, path) | `[new: user input, stored; 0 LLM calls]` | Paths only |
| Agent-to-skill links and the skill `enabled` flag | `[reused: L02 skills]` | `run-executor.ts:204-217` |
| The PR's repository and its default branch | `[reused: repos]` | `server/src/db/schema/repos.ts:15-16` |
| Review findings | `[reused: the review's existing LLM call]` | No added call |

## Untrusted inputs

- **Document text** comes from repository files. It is data, never
  instructions. In the prompt it sits inside an untrusted delimiter block under
  `## Project context`, covered by the existing injection guard
  (`reviewer-core/src/prompt.ts:16-28`). A document may add review criteria; it
  can never waive, reduce or descope a finding.
- **Document paths** are file names chosen by whoever commits to the
  repository. They are data. Where a path is put in the prompt (the document
  label, the `## Project specifications` list), characters that could close or
  forge a delimiter or start a new line are removed. In the UI a path is
  rendered as text.
- **Preview** renders document text as Markdown in the browser. Raw HTML and
  scripts in a document are not executed.
- **The trace drawer** shows the injected text as plain text. It is never sent
  back to a model by this feature.
- **Model output** that names a document path is free text in a finding's
  rationale. The system does not resolve, open or act on it.
- **MCP**: no tool returns document text or attachment data in this feature.

## Decisions

Decided by the user

| ID | Decision |
|---|---|
| U1 | An attachment is a repository plus a path. A Context tab lists the active repository's documents; a run reads only the attachments of the PR's repository. |
| U2 | The Project Context page is read-only: nav entry, list, preview, "Used by N agents", refresh. Attaching happens only in the Context tabs. |
| U3 | A skill's documents are merged as full text into the agent's `## Project context` block (the agent's own first, deduplicated by path), and the skill's section also carries the `## Project specifications` path list. |
| U4 | Documents are read from the clone's default-branch tree. A document added or changed by the PR is not what the reviewer reads. |
| U5 | A missing document is skipped and reported in the trace and the log, and the run continues. A total token budget is filled in attachment order; documents past it are reported as dropped. |
| U6 | No reordering. Documents are injected in the order they were attached. |
| U7 | The agent tab's token total covers the documents checked in that tab only. |

Decisions taken under the MVP principle

The parent session took these under the principle above. The user has not
confirmed them one by one and can overturn any of them at approval.

| ID | Decision | Reason |
|---|---|---|
| D1 | One server-side token count is shared by the list, the tabs and the trace (AC-8). | The user asked for counts "calculated on the fly so we know exactly how many tokens". |
| D2 | One server-wide search-pattern setting; dot-directories matched; the indexer's excluded directories skipped (AC-1 to AC-3). | "Search roots are defined in the configuration"; this repo's documents sit under `.context/`. |
| D3 | A document's type is its nearest `specs`, `docs` or `insights` directory, else `other` (AC-6). | One rule covers a path under two roots and a custom pattern. |
| D4 | The prompt keeps today's order and the trace drawer follows it, against image 10 (AC-53, AC-71). | No change to code that already orders the sections (`prompt.ts:207-210`). |
| D5 | `specs_read` items become `path` and `tokens`; skipped documents are listed with `path` and `reason` (AC-62, AC-63). | Required by "the list of documents, and their size in tokens" and by U5. |
| D6 | Attaching and detaching bump no version (AC-43). | Linking a skill bumps none today (`SkillsTab.tsx:10-14`). |
| D7 | The reviewer names the path in the rationale, prompted by a fixed instruction; `Finding` gains no field (AC-52). | A new field would change both contract copies and the MCP output. |
| D8 | A map-reduce run carries the block in every per-file call; the trace lists each document once (AC-61, AC-62). | It is what the engine does for every prompt slot today (`reviewer-core/src/review/run.ts:184`). |
| D9 | The browser flows assert only the not-cloned state on seed data. | The seeded repository has no clone. |
| D10 | The unused client stubs for `/repos/:id/context` and `/repos/:id/context/reindex` are replaced or removed (AC-73). | They call routes the server does not serve (`client/src/lib/hooks/core.ts:122-136`). |
| D11 | Only linked and enabled skills pass their documents (AC-47). | It matches how skill bodies reach the prompt (`run-executor.ts:204-217`). |
| D12 | The budget is one server-wide setting, default 8,000 tokens; the first document that does not fit and every later one are skipped (AC-56, AC-57). | It matches U5. The figure 8,000 is unmeasured. |
| D13 | A skill's run-time path list names only injected documents (AC-54). | A listed path with no text points the model at something it cannot read. |
| D14 | A missing attachment stays in the tab with a detach control (AC-38). | Without it the attachment could never be removed from the UI. |
| D15 | "Used by N agents" counts agents that receive the document directly or through a linked, enabled skill (AC-15). | The number should be true. |
| D16 | Refresh re-scans the clone and does not fetch (AC-16). | Fetching is the existing Resync action (`server/src/modules/repo-intel/routes.ts:81`). |
| D17 | The budget indicator and the repository label in the tab are cut (AC-45, AC-75 removed). | Neither is in the design or the requirements. |
| D18 | The duplicate-attach rule is cut (AC-42 removed). | A checkbox cannot attach a path twice, and AC-49 removes duplicates at run time. |

## Open questions

None.
