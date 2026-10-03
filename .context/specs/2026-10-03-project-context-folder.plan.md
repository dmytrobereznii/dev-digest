# Plan: Project Context Folder
Spec: SPEC-11 — 2026-10-03-project-context-folder.md
Status: ready

Decisions below are numbered `Dn`; the spec's own decision table is cited as
`spec-Dn`. Active criteria: 71 `AC-n` (AC-27, 28, 35, 42, 45, 75, 77 are
removed in the spec) and 7 `NFR-n`.

## 1. What already ships

| Layer | Fact | path:line |
|---|---|---|
| Engine | `specs?: string[]` slot; each chunk wrapped with the positional label `spec-N` | `reviewer-core/src/prompt.ts:118`, `:185-188` |
| Engine | Section order is Repo skeleton → Project context → Callers → Diff (AC-53 already holds) | `reviewer-core/src/prompt.ts:207-216` |
| Engine | `assembly.specs` holds the blocks only, without the `## Project context` heading | `reviewer-core/src/prompt.ts:210`, `:229` |
| Engine | `safeLabel` strips `<>"\r\n` and cuts at 80 chars | `reviewer-core/src/prompt.ts:31`, `:44-46` |
| Engine | Skills render as `## <name>` sections; `PromptSkill` is `name`, `body`, `trusted` | `reviewer-core/src/prompt.ts:100-104`, `:167-180` |
| Engine | Map-reduce spreads the same `promptParts` into every per-file prompt (AC-61 already holds) | `reviewer-core/src/review/run.ts:141-151`, `:184` |
| Server | Executor resolves linked + enabled skills, passes no `specs`, hard-codes `specs_read: []` | `server/src/modules/reviews/run-executor.ts:210-217`, `:231-259`, `:319` |
| Server | Failed/cancelled trace builder (stays as is, non-goal) | `server/src/modules/reviews/run-executor.ts:461-495` |
| Server | `container.intent` is the precedent for reviews reaching another module's service | `server/src/platform/container.ts:146-148` |
| Server | `Tokenizer` port lives beside its adapter, with a container getter and override | `server/src/adapters/tokenizer/index.ts:16-18`, `:25`; `server/src/platform/container.ts:57`, `:158-162` |
| Server | Indexer exclusions; the indexer walk skips symlinks and those dirs but keeps only code extensions | `server/src/modules/repo-intel/constants.ts:17-26`; `server/src/modules/repo-intel/pipeline/walk.ts:89-101` |
| Server | The working tree moves only on `sync` (`reset --hard origin/<branch>`); a PR head is fetched to a ref, never checked out | `server/src/adapters/git/simple-git.ts:72-88` |
| Server | `GitClient.readFile` has realpath containment; the port has no listing | `server/src/adapters/git/simple-git.ts:139-147`; `server/src/vendor/shared/adapters.ts:226-227` |
| Server | A repo with no clone has `clone_path` null | `server/src/db/schema/repos.ts:16` |
| Server | `agent_skills` (composite PK, cascade FKs, `order`) is the link-table precedent | `server/src/db/schema/agents.ts:51-63` |
| Server | `linkedSkills` returns links in `order` ascending | `server/src/modules/agents/repository.ts:192-200` |
| Server | Config is one Zod env schema; no pattern or budget setting exists | `server/src/platform/config.ts:15-47` |
| Server | `ApiErrors` / `NotFound` response envelopes; `ValidationError` is 422 | `server/src/modules/_shared/schemas.ts:26-34`; `server/src/platform/errors.ts:25-29` |
| Server | `GET /runs/:id/trace` serializes through `RunTrace`, so a `.default()` is applied on read | `server/src/modules/reviews/routes.ts:155-157` |
| Contract | `specs_read: z.array(z.string())`; `config.skills` uses `.default([])` for old traces | `server/src/vendor/shared/contracts/trace.ts:85`, `:92`; client copy `:91` |
| Contract | `trace.ts` copies differ in two comments only; baseline drift is 5 files | `diff -r client/src/vendor/shared server/src/vendor/shared` |
| Client | Dormant hooks call `/repos/:id/context` and `/context/reindex`, which no route serves | `client/src/lib/hooks/core.ts:122-137` |
| Client | Sidebar groups are literals in the vendored kit; WORKSPACE holds only Pull Requests | `client/src/vendor/ui/nav.ts:21-27` |
| Client | `/context` already maps to the active key `context`; `nav.context` copy exists | `client/src/components/app-shell/helpers.ts:30`; `client/messages/en/shell.json` |
| Client | `context.json` holds dormant design copy and is not in `USED_NAMESPACES` | `client/messages/en/context.json:1-24`; `client/src/app/layout.tsx:21-33` |
| Client | Agent tabs: `TABS` plus a hard-coded `VALID_TABS`; skill route derives it from `TABS` | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:11-14`; `client/src/app/agents/[id]/page.tsx:15`; `client/src/app/skills/[id]/_components/SkillEditor/constants.ts:20-24` |
| Client | `SkillsTab` is the checkbox-row layout precedent | `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:110-123` |
| Client | Trace drawer renders `specs_read` as strings; Prompt assembly order already follows the prompt | `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:53-65`, `:88-106` |
| Client | `PromptBlock` is collapsed by default and expands to the stored text | `.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx:26`, `:74-78` |
| Client | `Markdown` uses `react-markdown` + `remark-gfm`, no raw-HTML plugin | `client/src/vendor/ui/primitives/Markdown.tsx:15-17` |
| Design | 3 surfaces in the artboards: nav entry, N6 page + empty artboard, trace "Specs read" row. The Context tabs (spec images 8-10) are not in the extracted design | `.context/docs/design/src/chrome.jsx:7`; `screen_tour_context.jsx:103-138`; `screen_trace.jsx:94` |
| E2E | The seeded repo has no clone; flows run in order against one session | `e2e/.context/docs/seed-contract.md:19` |

Design greps: component grep 0 files; feature grep 5 files, of which
`data2.jsx` is a fixture and `screen_conv_conf.jsx` is the Conformance screen
(out of scope).

## 2. Decisions

### D1 — Routes
`GET /repos/:id/context` (list), `GET /repos/:id/context/content?path=`,
and for `owner ∈ {agents, skills}`: `GET /:owner/:id/context?repo_id=`,
`POST /:owner/:id/context` body `{repo_id, path}`,
`DELETE /:owner/:id/context?repo_id=&path=`. Unknown repo/owner → 404.
Attach and detach are idempotent.
*Why:* the list keeps the URL the client stub already names; a path with
slashes is safe in a query string; `api.del` sends no body
(`client/src/lib/api.ts:114-115`).
*Rejected:* a wildcard path param; a PUT of the whole set as Skills does
(the client would own the order, which is reordering by another name).
Serves: AC-11, AC-24, AC-25, AC-41, AC-73.

### D2 — The list response also carries `pattern`
*Why:* AC-19 must name the configured pattern and the client cannot know a
server setting. *Rejected:* a second settings route. Serves: AC-19.

### D3 — One module, `modules/project-context`, reached through `container.projectContext`
The service takes the ports it uses (onion-architecture → *Dependency
injection*); no `helpers ↔ repository` import, so `depcruise` stays at 16
warnings. *Rejected:* putting the reader in `repo-intel` (its walk is
code-only) or importing the module from `reviews`.
Serves: AC-1..11, AC-46, AC-47.

### D4 — `DocumentReader` port beside its adapter, `adapters/docs/index.ts`
`listPaths(root)` and `read(root, path)`; own walker that never follows a
symlink, takes its excluded directories from `EXCLUDED_DIRS`, and `read`
repeats the realpath containment of `simple-git.ts:139-147`.
*Why:* filesystem access is ring 4 (onion-architecture → *Where does this
code go?*); the Tokenizer precedent keeps the interface out of the drifted
`adapters.ts` copies. *Rejected:* adding `list` to `GitClient` (both
vendored copies, plus a mock contract change).
Serves: AC-1..4, AC-10, AC-11, NFR-4.

### D5 — Glob matching with `picomatch`, `{ dot: true }`
Added with `pnpm add picomatch` and `pnpm add -D @types/picomatch` in
`server/`. *Why:* zero dependencies, comma braces and `**` supported, `dot`
option documented. *Rejected:* `path.matchesGlob` (added in Node 22.5,
stable in 22.20; the repo floor is Node 22); a hand-written translator;
importing the copy pnpm happens to hoist without declaring it.
Serves: AC-1, AC-2.

### D6 — Two link tables, composite PK, identity column for order
`agent_context_docs(repo_id, agent_id, path, seq)` and
`skill_context_docs(repo_id, skill_id, path, seq)`; PK
`(repo_id, <owner>_id, path)`; all FKs `ON DELETE CASCADE`; `seq bigint
GENERATED ALWAYS AS IDENTITY`; lists `ORDER BY seq`. No extra index: the PK
prefix serves the repo lookups and the server INSIGHTS requires an index
claim to be measured.
*Why:* every column NOT NULL and every rule a plain PK/FK
(postgresql-table-design → *Core Rules*); `seq` cannot tie as two
timestamps can. *Rejected:* one polymorphic table without owner FKs (no
cascade, AC-44); one table with two nullable FKs and a CHECK.
Serves: AC-24, AC-25, AC-26, AC-44, AC-48, NFR-2.

### D7 — "No clone" means `repos.clone_path` is null
An unreadable root lists zero documents. Serves: AC-9, AC-20, AC-40.

### D8 — `specs` becomes `PromptSpec[]` (`{ path, content }`); the label is the sanitized path, uncapped
`safeLabel` keeps its character strip; the 80-char cut is not applied to a
document path (the filesystem bounds it). The same sanitizer feeds the
`- <path>` lines. *Rejected:* keeping the cap (paths in this repo exceed 80
and two could collapse to one label); a parallel `specPaths` array.
Serves: AC-50, AC-51.

### D9 — Section layout; `assembly.specs` stores the whole section
`## Project context` + one fixed instruction line + the blocks.
`assembly.specs` holds that exact text including the heading, so the drawer
shows what was sent. Empty or absent `specs` adds nothing.
*Rejected:* the instruction in the system prompt (changes every prompt,
breaks AC-59). Serves: AC-52, AC-59, AC-69.

### D10 — The skill path list sits outside the untrusted wrapper
`PromptSkill.specPaths?: string[]`; when non-empty the skill's section ends
with `## Project specifications` and one `- <sanitized path>` line each.
Absent or empty changes nothing. Serves: AC-54, AC-59.

### D11 — Run planning is one pure function
`planInjection(candidates, listedPaths, tokensOf, budget)`: dedupe by path →
a path not listed, or one that fails to read, is `missing` → running sum;
the first overflow and every later listed document is `over_budget`. A
failure of the whole lookup injects nothing, logs one line and the run
continues (same rule as the repo map, `run-executor.ts:426-429`).
Serves: AC-48, AC-49, AC-55..58, AC-78.

### D12 — `specs_skipped` uses `.default([])`
Same guard as `config.skills`. The failure-path trace gets
`specs_skipped: []` only because the inferred type requires it; it records
nothing new. Serves: AC-63, AC-72.

### D13 — Client composition
Shared rung-2 folder `client/src/components/project-context/`
(`ContextDocList`, `DocumentPreview`, `DocTypeBadge`, `helpers.ts`); each
editor owns a thin `ContextTab` variant that passes heading, badge and
footer (frontend-architecture → *Components*, explicit variants over
flags). Copy: page and shared list in `context.json` (added to
`USED_NAMESPACES`), tab-specific strings in `agents.json` / `skills.json`,
trace strings in `runs.json`. Skill tab order: Config, Context, Preview,
Versions. No `gKey` for the nav entry.
Serves: AC-21..23, AC-31, AC-32, NFR-6.

### D14 — Stubs: delete the two hooks, leave the `SpecFile` / `IndexStatus` contracts
*Why:* removing contracts edits both vendored copies for no criterion.
Serves: AC-73.

## 3. Tasks

Test IDs: file prefix + number; the title is quoted so plan-verifier can
grep it.

### 3.1 Slice A — Contracts (both `shared/` copies)
Files: `{client,server}/src/vendor/shared/contracts/project-context.ts`
(new, identical), `contracts/trace.ts` and `index.ts` in both copies;
compile fallout in `server/src/platform/trace-builder.ts:37,57`,
`server/src/db/seed.ts:500`, `server/src/db/seed-prs/helpers.ts:194`,
`run-executor.ts:319,492`, `TraceBody.tsx:58-62` (render `sp.path`),
`RunTraceDrawer.test.tsx:23`. Depends on: nothing.

- [x] T1 `ProjectDocument`, `ProjectDocumentList` (`status`, `pattern`, `documents[]`), `ProjectDocumentContent`, `ContextAttachments` in both copies → AC-5, AC-9, NFR-7 → K1
- [x] T2 `SpecRead`, `SpecSkipped`; `specs_read: SpecRead[]`, `specs_skipped` with `.default([])`; fix the fallout sites → AC-62, AC-63, AC-72, NFR-7 → K2, K3

Tests — `server/test/contracts.test.ts`:
K1 "project-context contracts parse the External contracts shapes" ·
K2 "RunTrace specs_read holds path and tokens, specs_skipped holds path and reason" ·
K3 "RunTrace stored before specs_skipped existed still parses".

### 3.2 Slice B — reviewer-core prompt
Files: `reviewer-core/src/prompt.ts`, `src/review/run.ts:65`,
`src/index.ts`; `server/test/prompt-structured.test.ts:19` and
`server/test/prompt-callers.test.ts:20` move to the new `specs` shape.
Depends on: nothing (parallel with A).

- [x] T3 `PromptSpec`; label = sanitized path, no 80-char cut → AC-50, AC-51 → P1, P2, P3
- [x] T4 fixed instruction line; `assembly.specs` = whole section → AC-52, AC-69 → P4, P5
- [x] T5 `PromptSkill.specPaths` → `## Project specifications` list → AC-54 → P6
- [x] T6 lock what already holds: order, byte-identity, per-file prompts, call count → AC-53, AC-59, AC-61, NFR-1 → P7, P8, R1, R2

Tests — `reviewer-core/test/prompt.test.ts`:
P1 "labels each document block with its repo-relative path" ·
P2 "keeps a path longer than 80 characters and strips delimiter characters and line breaks" ·
P3 "a document body cannot close its own delimiter" ·
P4 "Project context carries the fixed instruction to name the document path in the rationale" ·
P5 "assembly.specs is the Project context section exactly as sent" ·
P6 "a skill with injected documents ends with Project specifications and one path line each" ·
P7 "Project context sits after Repo skeleton and before Callers of changed symbols" ·
P8 "no documents and no skill paths: the prompt is byte-identical to the pre-feature prompt".
`reviewer-core/test/run.test.ts`:
R1 "map-reduce: every per-file prompt carries the same Project context section" ·
R2 "documents do not change the number of LLM calls".

### 3.3 Slice C — Server: reader, config, schema, API
Files: `server/package.json` + lockfile (via pnpm only),
`server/src/adapters/docs/index.ts`, `server/src/adapters/mocks.ts`
(`MockDocumentReader`), `server/src/platform/config.ts`,
`server/.env.example`, `server/src/platform/container.ts`,
`server/src/db/schema/context.ts`, `server/src/db/schema.ts`, the generated
`0016_*` migration (`cd server && pnpm db:generate`, never hand-written),
`server/src/modules/project-context/{routes,service,repository,helpers,constants}.ts`,
`server/src/modules/index.ts`. Depends on: A.

- [x] T7 `PROJECT_CONTEXT_GLOB` and `PROJECT_CONTEXT_BUDGET_TOKENS` → `AppConfig.projectContextPattern` / `projectContextBudget` → AC-1, AC-56 → G1
- [x] T8 `DocumentReader` + `FsDocumentReader` (picomatch, D4/D5), container getter + override, mock → AC-1, AC-2, AC-3, AC-4, AC-10, NFR-4 → F1..F6
- [x] T9 the two tables of D6 and their migration → AC-24, AC-26, AC-44, NFR-2 → I6, I11
- [x] T10 list + content: `documentType` helper, token counts from `container.tokenizer` at request time, `not_cloned`, 404 off-list → AC-5, AC-6, AC-7, AC-9, AC-11, AC-16, AC-19 → H1, I1..I5
- [x] T11 attachment routes for agents and skills; 422 when the path is not listed; no version bump → AC-24, AC-25, AC-41, AC-43 → I6..I10
- [x] T12 `used_by_agents`: distinct agents by direct attachment or by linked, enabled skill → AC-15 → I12

Tests — `server/test/project-context-config.test.ts`:
G1 "pattern defaults to **/{specs,docs,insights}/**/*.md and budget to 8000, both overridable".
`server/test/adapters/docs/fs-reader.test.ts` (tmp dir, no Docker):
F1 "lists every file matching the pattern" ·
F2 "matches directories whose names begin with a dot" ·
F3 "omits files under every indexer-excluded directory" ·
F4 "reads the working tree as it is on disk and runs no git command" ·
F5 "does not list a symlink that points outside the root" ·
F6 "read rejects a path that resolves outside the root".
`server/src/modules/project-context/helpers.test.ts`:
H1 "documentType is the nearest specs, docs or insights directory, else other".
`server/test/project-context.it.test.ts` (`MockDocumentReader`, real Postgres):
I1 "list returns path, type and tokens for each document" ·
I2 "token counts follow the file content at request time" ·
I3 "a repository with no clone returns not_cloned and no documents" ·
I4 "content for a path outside the list is 404 with no content" ·
I5 "a file added on disk appears in the next list with no git sync" ·
I6 "attach stores owner, repository and path and no document text" ·
I7 "detach deletes the attachment" ·
I8 "attachments are returned in attach order; re-attaching moves a path to the end" ·
I9 "attach of an unlisted path is 422 and stores nothing" ·
I10 "attach and detach leave the owner version unchanged" ·
I11 "deleting an agent, a skill or a repository deletes its attachments" ·
I12 "used_by_agents counts each agent once, direct or through an enabled linked skill".

### 3.4 Slice D — Server: run, trace, Live Log
Files: `modules/project-context/helpers.ts` + `service.ts`
(`resolveForRun`), `platform/container.ts` (`projectContext`),
`modules/reviews/run-executor.ts`. Depends on: B, C.

- [x] T13 `planInjection` (D11) and `skillSpecPaths` → AC-48, AC-49, AC-55, AC-56, AC-57, AC-58 → H2..H6
- [x] T14 `resolveForRun(agentId, enabled linked skill ids, repo)`: attachments of the PR's repository only, read from the clone, counted by the tokenizer → AC-46, AC-47, AC-60, AC-8 → X1, X2, X9
- [x] T15 executor: pass `specs` and `specPaths`, write `specs_read` / `specs_skipped`, emit the log lines, never fail the run → AC-50, AC-54, AC-59, AC-62, AC-63, AC-64, AC-65, AC-70, AC-78, NFR-1, NFR-3 → X3..X12

Tests — `helpers.test.ts` (same file as H1):
H2 "planInjection orders agent documents first, then each skill in link order" ·
H3 "planInjection keeps the first occurrence of a repeated path" ·
H4 "planInjection skips an unlisted path as missing" ·
H5 "planInjection skips the first overflow and every later document as over_budget" ·
H6 "skillSpecPaths lists only injected documents attached to that skill".
`server/test/reviews-context.it.test.ts`:
X1 "injects the documents attached to the agent for the PR's repository only" ·
X2 "injects documents of a linked enabled skill and none of a disabled one" ·
X3 "each document's whole text sits in its own untrusted block" ·
X4 "the skill section lists only its injected paths" ·
X5 "a missing document is skipped and the run completes" ·
X6 "documents past the budget are skipped as over_budget" ·
X7 "specs_read lists each document once with the token count the list reports" ·
X8 "the Live Log has one summary line and one line per skipped document" ·
X9 "the same number of LLM calls with and without attachments, and document text reaches only the agent's provider" ·
X10 "no attachments: specs is null, specs_read is empty and the user prompt is unchanged" ·
X11 "the stored section text survives an edit or deletion of the document" ·
X12 "a repository with no clone skips every attachment as missing".

### 3.5 Slice E — Client: data, nav, Project Context page
Files: `client/src/lib/hooks/project-context.ts` (+ export line in
`hooks/index.ts`), `client/src/lib/hooks/core.ts:18-19,122-137` (delete),
`client/src/vendor/ui/nav.ts` (read `vendor/ui/README.md` first),
`client/src/components/project-context/{DocumentPreview,DocTypeBadge}/`,
`client/src/app/repos/[repoId]/context/{page.tsx,loading.tsx,_components/ProjectContextView/}`,
`client/messages/en/context.json` (rewrite; grep for readers first),
`client/src/app/layout.tsx:21-33`. Depends on: A.

- [x] T16 hooks for list, content, attachments, attach, detach; delete `useContextFiles` / `useReindexContext` → AC-73 → Q1
- [x] T17 "Project Context" item in the WORKSPACE group, href `/repos/:repoId/context` → AC-12 → N1
- [x] T18 `DocumentPreview` (content hook + `Markdown`, read-only) and `DocTypeBadge` → AC-14, AC-30 → M1, M2
- [x] T19 page: list with path + badge, selection, "Used by N agents", refresh = refetch, loading / error / empty (names `pattern`) / not-cloned states → AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, NFR-5, NFR-6 → V1..V8

Tests — `client/src/lib/hooks/project-context.test.ts`:
Q1 "requests only the Project Context routes the API serves".
`client/src/vendor/ui/nav.test.ts`:
N1 "WORKSPACE has a Project Context entry that resolves to the active repository".
`.../project-context/DocumentPreview/DocumentPreview.test.tsx`:
M1 "renders the document content as Markdown with no edit control" ·
M2 "raw HTML in a document is not rendered as elements".
`.../ProjectContextView/ProjectContextView.test.tsx`:
V1 "lists every document with its path and type badge" ·
V2 "selecting a document shows its content" ·
V3 "shows Used by N agents for the selected document" ·
V4 "refresh reloads the list" ·
V5 "shows a loading state" ·
V6 "shows the error in place of the list" ·
V7 "the empty state names the search pattern" ·
V8 "says the repository is not cloned".

### 3.6 Slice F — Client: Context tabs
Files: `client/src/components/project-context/ContextDocList/`,
`.../project-context/helpers.ts`,
`AgentEditor/_components/ContextTab/`, `AgentEditor/{AgentEditor.tsx,constants.ts}`,
`client/src/app/agents/[id]/page.tsx:15`,
`SkillEditor/_components/ContextTab/`, `SkillEditor/{SkillEditor.tsx,constants.ts}`,
`client/messages/en/{agents,skills,context}.json` (merge, do not replace
blocks). Depends on: E.

- [x] T20 `ContextDocList`: rows (checkbox, file name, directory, badge, Preview), filter, token total, missing rows with detach, select-repo and not-cloned states → AC-23, AC-24, AC-25, AC-29, AC-30, AC-33, AC-34, AC-38, AC-39, AC-40, NFR-5, NFR-6 → U1..U4, L1..L9
- [x] T21 agent `ContextTab`, tab after Skills, `VALID_TABS` → AC-21, AC-31, AC-36 → A1, A2, A3
- [x] T22 skill `ContextTab`, tab after Config, "Serializes as" box → AC-22, AC-32, AC-37, AC-76 → S1..S4

Tests — `.../project-context/helpers.test.ts`:
U1 "filterDocuments matches the path ignoring case" ·
U2 "sumTokens adds only the checked documents" ·
U3 "missingPaths returns attached paths that are no longer listed" ·
U4 "serializeSpecList is the heading and one path line per attachment in order".
`.../ContextDocList/ContextDocList.test.tsx`:
L1 "each row has a checkbox, file name, directory, type badge and Preview" ·
L2 "checking a document attaches it for the active repository" ·
L3 "unchecking a document detaches it" ·
L4 "the filter narrows rows by path" ·
L5 "Preview shows the document content read-only" ·
L6 "the token total follows the checked documents without a reload" ·
L7 "an attached path that is no longer listed is marked missing with a detach control" ·
L8 "asks for a repository when none is active" ·
L9 "says the repository is not cloned".
`AgentEditor/_components/ContextTab/ContextTab.test.tsx`:
A1 "heading Project context with N of M attached" ·
A2 "states that documents are injected as an untrusted Project context block".
`AgentEditor/AgentEditor.test.tsx`: A3 "shows a Context tab after Skills".
`SkillEditor/_components/ContextTab/ContextTab.test.tsx`:
S1 "heading Project context to use with N attached" ·
S2 "shows the inherit sentence" ·
S3 "Serializes as lists attached paths in order, and is absent with none".
`SkillEditor/SkillEditor.test.tsx`: S4 "shows a Context tab after Config".

### 3.7 Slice G — Client: trace drawer
Files: `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx`,
`RunTraceDrawer.test.tsx`, `client/messages/en/runs.json`. Depends on: A.

- [x] T23 "Specs read" shows path + token count; a skipped list with path + reason (reads `specs_skipped ?? []`) → AC-66, AC-67, AC-72 → W1, W2, W6
- [x] T24 `trace.prompt.specs` becomes "Project context — attached specs (untrusted)"; lock entry order → AC-68, AC-69, AC-71 → W3, W4, W5

Tests — `RunTraceDrawer.test.tsx`:
W1 "Specs read lists each path with its token count" ·
W2 "lists skipped documents with path and reason" ·
W3 "shows the Project context entry only when documents were injected" ·
W4 "expanding the entry shows the stored section text" ·
W5 "Prompt assembly entries follow the prompt order" ·
W6 "opens a trace stored before this feature without an error".

### 3.8 Slice H — E2E and the manual check
Files: `e2e/specs/13-project-context.flow.json`,
`e2e/.context/docs/seed-contract.md` (one row). Depends on: D, E, F.

- [x] T25 flow on seed data: sidebar entry → not-cloned page; Security Reviewer → Context tab → not-cloned state (`wait --load networkidle` before each tab click) → AC-12, AC-20, AC-21, AC-40 → E1
- [ ] T26 run the spec's manual scenario with a live model and record the finding and the trace → AC-74 → manual (spec, "Verification scenario")

Test — E1 `e2e/specs/13-project-context.flow.json`
"Project Context shows the not-cloned state on the seeded repo".

## 4. Traceability

| AC | Task | Test | Commit |
|---|---|---|---|
| AC-1 | T7, T8 | G1, F1 | 4880579 |
| AC-2 | T8 | F2 | 4880579 |
| AC-3 | T8 | F3 | 4880579 |
| AC-4 | T8 | F4 | 4880579 |
| AC-5 | T1, T10 | K1, I1 | 264deb7, 4880579 |
| AC-6 | T10 | H1 | 4880579 |
| AC-7 | T10 | I2 | 4880579 |
| AC-8 | T14 | X7 | 3cecda1 |
| AC-9 | T1, T10 | I3 | 264deb7, 4880579 |
| AC-10 | T8 | F5 | 4880579 |
| AC-11 | T10 | I4, F6 | 4880579 |
| AC-12 | T17, T25 | N1, E1 | 4dbfa4c, ca9c74e |
| AC-13 | T19 | V1 | 4dbfa4c |
| AC-14 | T18, T19 | M1, V2 | 4dbfa4c |
| AC-15 | T12, T19 | I12, V3 | 4880579, 4dbfa4c |
| AC-16 | T10, T19 | I5, V4 | 4880579, 4dbfa4c |
| AC-17 | T19 | V5 | 4dbfa4c |
| AC-18 | T19 | V6 | 4dbfa4c |
| AC-19 | T10, T19 | V7 | 4880579, 4dbfa4c |
| AC-20 | T19, T25 | V8, E1 | 4dbfa4c, ca9c74e |
| AC-21 | T21, T25 | A3, E1 | 8e032c8, ca9c74e |
| AC-22 | T22 | S4 | 8e032c8 |
| AC-23 | T20 | L1 | 8e032c8 |
| AC-24 | T9, T11, T20 | I6, L2 | 4880579, 8e032c8 |
| AC-25 | T11, T20 | I7, L3 | 4880579, 8e032c8 |
| AC-26 | T9 | I6 | 4880579 |
| AC-29 | T20 | U1, L4 | 8e032c8 |
| AC-30 | T18, T20 | L5 | 4dbfa4c, 8e032c8 |
| AC-31 | T21 | A1 | 8e032c8 |
| AC-32 | T22 | S1 | 8e032c8 |
| AC-33 | T20 | U2, L6 | 8e032c8 |
| AC-34 | T20 | L6 | 8e032c8 |
| AC-36 | T21 | A2 | 8e032c8 |
| AC-37 | T22 | U4, S3 | 8e032c8 |
| AC-38 | T20 | U3, L7 | 8e032c8 |
| AC-39 | T20 | L8 | 8e032c8 |
| AC-40 | T20, T25 | L9, E1 | 8e032c8, ca9c74e |
| AC-41 | T11 | I9 | 4880579 |
| AC-43 | T11 | I10 | 4880579 |
| AC-44 | T9 | I11 | 4880579 |
| AC-46 | T14 | X1 | 3cecda1 |
| AC-47 | T14 | X2 | 3cecda1 |
| AC-48 | T13 | H2, I8 | 3cecda1 |
| AC-49 | T13 | H3 | 3cecda1 |
| AC-50 | T3, T15 | P1, P3, X3 | 412664c, 3cecda1 |
| AC-51 | T3 | P1, P2 | 412664c |
| AC-52 | T4 | P4 | 412664c |
| AC-53 | T6 | P7 | 412664c |
| AC-54 | T5, T15 | P6, H6, X4 | 412664c, 3cecda1 |
| AC-55 | T13 | H4, X5, X12 | 3cecda1 |
| AC-56 | T7, T13 | G1, H5 | 4880579, 3cecda1 |
| AC-57 | T13 | H5, X6 | 3cecda1 |
| AC-58 | T13 | X3 | 3cecda1 |
| AC-59 | T6, T15 | P8, X10 | 412664c, 3cecda1 |
| AC-60 | T14 | X9 | 3cecda1 |
| AC-61 | T6 | R1 | 412664c |
| AC-62 | T2, T15 | K2, X7 | 264deb7, 3cecda1 |
| AC-63 | T2, T15 | K2, X5, X6 | 264deb7, 3cecda1 |
| AC-64 | T15 | X8 | 3cecda1 |
| AC-65 | T15 | X8 | 3cecda1 |
| AC-66 | T23 | W1 | 133853b |
| AC-67 | T23 | W2 | 133853b |
| AC-68 | T24 | W3 | 133853b |
| AC-69 | T4, T24 | P5, W4 | 412664c, 133853b |
| AC-70 | T15 | X11 | 3cecda1 |
| AC-71 | T24 | W5 | 133853b |
| AC-72 | T2, T23 | K3, W6 | 264deb7, 133853b |
| AC-73 | T16 | Q1 | 4dbfa4c |
| AC-74 | T26 | manual | — |
| AC-76 | T22 | S2 | 8e032c8 |
| AC-78 | T15 | X5, X12 | 3cecda1 |
| NFR-1 | T6, T15 | R2, X9 | 412664c, 3cecda1 |
| NFR-2 | T9 | I6 | 4880579 |
| NFR-3 | T15 | X9 | 3cecda1 |
| NFR-4 | T8 | F5, F6 | 4880579 |
| NFR-5 | T19, T20 | V1, L1 (controls found by role and accessible name) | 4dbfa4c, 8e032c8 |
| NFR-6 | T19, T20 | V1..V8, L1..L9, A1, S1 assert on `messages/en` values | 4dbfa4c, 8e032c8 |
| NFR-7 | T1, T2 | `diff -r` reports the 5 baseline files only (§6) | 264deb7 |

## 5. Execution

Order and dependencies:

    A ──┬── C ──┐
        │       ├── D ──┐
    B ──┼───────┘       │
        ├── E ── F ─────┼── H
        └── G ──────────┘

- A first: it freezes the contract every other slice compiles against.
- Parallel group 1 (disjoint files): B (reviewer-core + two server test
  files), C (server), E (client hooks, nav, page, `context.json`),
  G (trace drawer, `runs.json`).
- Parallel group 2: D (after B and C; shares `container.ts` with C, so
  never beside it) and F (after E; shares `context.json` and the
  `project-context/` folder).
- H last; T26 needs a cloned repository and a model key, so the user runs it.
- Only slice C runs pnpm against `server/`; if `pnpm add` fails with
  `ERR_PNPM_UNEXPECTED_STORE`, stop and hand it to the user (server
  INSIGHTS).
- Not planned, no criterion asks for it: the README route and API maps.

## 6. Verification

- `make typecheck` · `make lint` (client 0 errors / 52 warnings, server
  0 / 0) · `make lint-arch` (0 errors / 16 warnings).
- `make test` after every slice; `make test-it` after C and D (Docker).
- `make check` before handing to plan-verifier, with `make dev` stopped so
  `build-web` runs: slice E starts value imports of Zod schemas in a hook.
- `make e2e` after H (`cd e2e && npm ci` once).
- `diff -r client/src/vendor/shared server/src/vendor/shared` still lists
  only `adapters.ts` and `contracts/{eval-ci,knowledge,productionize,trace}.ts`,
  and `trace.ts` still differs only in its two comments.
- No target for these, run raw: `cd server && pnpm db:generate`,
  `cd server && pnpm add picomatch`.
- AC-73 spot check: `grep -rn "context/reindex" client/src` returns nothing.
