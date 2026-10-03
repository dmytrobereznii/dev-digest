# Plan: PR Why + Risk Brief
Spec: SPEC-12 — 2026-10-03-pr-why-risk-brief.md
Status: ready

No open question. Q1 (the three seeded Review focus reasons) was answered
on 2026-10-03. AC-92, AC-93 and AC-94 now quote every seeded value, each
true of the seeded patch, and T14 carries them (§3.3).

Decisions below are `Dn`; the spec's own table is cited as `spec-Dn`.
Criteria: 98 `AC-n` (AC-1 to AC-98, no gaps) and 11 `NFR-n`.
`PR/` stands for `client/src/app/repos/[repoId]/pulls/[number]`.

## 1. What already ships

| Layer | Fact | path:line |
|---|---|---|
| Contract | `PrBrief` requires `intent`, `blast`, `risks`, `history`; no `summary`, no `review_focus` | `server/src/vendor/shared/contracts/brief.ts:196-201` |
| Contract | `Intent`, `BlastRadius`, `BlastRadiusResponse`, `Risk`, `Risks` | `brief.ts:9-13`, `:85-89`, `:115-122`, `:129-141` |
| Contract | `risk_brief` defaults to `openai` / `gpt-4.1` | `server/src/vendor/shared/contracts/platform.ts:62-68` |
| Contract | `brief.ts` and `platform.ts` are identical today; drift is 5 other files | `diff -rq client/src/vendor/shared server/src/vendor/shared` |
| Contract | A cross-copy identity assertion already exists for another file | `server/test/contracts.test.ts:374-385` |
| DB | `pr_brief(pr_id PK → pull_requests, json jsonb NOT NULL)`; nothing reads or writes it. No schema change, no migration | `server/src/db/schema/reviews.ts:101-106` |
| Server | Intent read makes no model call; reached through `container.intent` | `server/src/modules/intent/service.ts:45-50`; `server/src/platform/container.ts:153-155` |
| Server | Route shape to copy: response schemas, 502, 10 per minute | `server/src/modules/intent/routes.ts:28-44`; `intent/service.ts:22-26` |
| Server | `BlastService` takes the whole `Container` and is built in its route | `server/src/modules/blast/service.ts:15-22`; `blast/routes.ts:17-21` |
| Server | Smart Diff role is the pure `classifyFile(path)` | `reviewer-core/src/smart-diff/classify.ts:20`; `server/src/modules/smart-diff/service.ts:30` |
| Server | "Used by an agent": direct attachments plus enabled linked skills | `server/src/modules/project-context/repository.ts:108-120` |
| Server | `planInjection` stops at the first document over budget | `server/src/modules/project-context/helpers.ts:30-67` |
| Server | Budget setting and its container wiring | `server/src/platform/config.ts:46-49`; `container.ts:179-188` |
| Server | `resolveFeatureModel`; a missing key throws `OPENROUTER_API_KEY is not configured` | `server/src/modules/settings/feature-models.ts:51-57`; `container.ts:239-240` |
| Server | The server's one direct `completeStructured` caller, with a module-local output schema and a prompt template | `server/src/modules/conventions/service.ts:145-152`; `conventions/prompt.ts:53-55`, `:105-122` |
| Server | The global rate-limit plugin is not registered under `NODE_ENV=test` | `server/src/app.ts:95-97` |
| Engine | The adapter reprompts inside one call and throws after `maxRetries + 1` attempts | `reviewer-core/src/llm/openrouter.ts:73-120` |
| Engine | `.max()` caps already run in a structured output on the same default model | `reviewer-core/src/intent/derive.ts:30-34` |
| Engine | `wrapUntrusted` cuts its label at 80 chars; the uncapped `safePath` is not exported | `reviewer-core/src/prompt.ts:31`, `:44-46`, `:56-58`, `:66-68` |
| Mock | `MockLLMProvider` records every call and throws when the fixture fails the schema | `server/src/adapters/mocks.ts:97-113` |
| Mock | `MockDocumentReader` lists sorted in-memory paths | `server/src/adapters/mocks.ts:309-320` |
| Seed | #482 files, head SHA, review summary; `DEMO_PR_FILES` is not exported | `server/src/db/seed.ts:32-37`, `:153`, `:183-184` |
| Seed | Insert-only precedent; hunk headers of the four patches | `server/src/db/seed-intent.ts:113-116`; `server/src/db/seed-diffs.ts:23`, `:113`, `:161`, `:172` |
| Seed | Design fixture risks (shape and kinds only; AC-92 no longer copies their text) | `.context/docs/design/src/data.jsx:42-46` |
| Test | Seed fixtures are checked against the parser in the unit lane | `server/test/seed-fixtures.test.ts:100-163` |
| Test | The `risk_brief` default is asserted with the old value | `server/test/settings-models.it.test.ts:70-73` |
| Client | Brief stack: banner or note, then the grid | `PR/_components/OverviewTab/OverviewTab.tsx:30-50` |
| Client | `IntentCard` returns its own `Card` in three states and reads `brief` | `PR/_components/IntentCard/IntentCard.tsx:16-47`, `:105` |
| Client | `brief.json` copy; `BlastRadiusCard` reads `block.blast` | `client/messages/en/brief.json:2-12`; `PR/_components/BlastRadiusCard/BlastRadiusCard.tsx:148`, `:156` |
| Client | Hook pattern; every mutation error also toasts | `client/src/lib/hooks/intent.ts:14-35`; `client/src/lib/providers.tsx:41-43` |
| Client | Tab lives in the URL through `router.replace`; `DiffTab` mounts when `tab === "diff"` | `PR/page.tsx:69-77`, `:176-183`; `PR/_components/PrDetailHeader/PrDetailHeader.tsx:118` |
| Client | Order is local state; the flat list is the fallback | `PR/_components/DiffTab/DiffTab.tsx:47-48`, `:119`, `:168-176` |
| Client | Group open state; docs and boilerplate start closed | `PR/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx:28`; `DiffTab/constants.ts:41`, `:47` |
| Client | Card open state: flagged, `startClosed`, 200-line cap; a line knows `newNo` | `client/src/components/diff-viewer/FileCard/FileCard.tsx:68-74`; `diff-viewer/constants.ts:4`; `CodeLine/CodeLine.tsx:66` |
| Client | Settings shows `f.defaultModel` when no choice is stored | `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:40` |
| Client | Test messages export `prReview`, `shell`, `context` only | `client/src/test/messages.ts:9-11` |
| Design | `BriefCard`, `RISK_ICON`, `RISK_SEV`; Risk areas sits inside the Intent card | `.context/docs/design/src/screen_pr_detail.jsx:20-21`, `:65-80` |
| E2E | Flows use `open`, `wait`, `find` only; a non-zero exit fails the step | `e2e/run.ts:71-91`; `e2e/specs/10-pr-intent.flow.json` |
| E2E | `$0.014` is asserted by flow 02 | `e2e/.context/docs/seed-contract.md:13` |

Design greps: component grep (`BriefCard`) 1 file; feature grep (`brief`,
`risk`, `review focus`) 4 files, of which `data.jsx` is a fixture and
`screen_dashboard.jsx` / `screen_conv_conf.jsx` only use the word "risk" in
unrelated copy. One surface: `screen_pr_detail.jsx`. Review focus, the
generate and refresh controls and their states have no artboard.

## 2. Decisions

### D1 — All brief contracts live in `contracts/brief.ts`
`ReviewFocusItem`, the widened `PrBrief`, `BriefMissingInput`,
`PrBriefStored` (what `pr_brief.json` holds, `pr_id` included),
`PrBriefRecord` (= stored + `stale`), `PrBriefResponse`.
*Why:* AC-3 names that file, so one identity check covers every shape.
*Rejected:* `review-api.ts` (outside AC-3).
Serves: AC-1, AC-2, AC-3, AC-4, AC-6, AC-10, NFR-3.

### D2 — The output schema is module-local and carries the caps as `.max()`
`BriefOutput` in `modules/brief/prompt.ts`; cap numbers in `constants.ts`.
`review_focus[].line` is a bare integer there, so a bad line is dropped by
grounding instead of costing a reprompt.
*Why:* the stored contract carries no cap (spec, External contracts);
`.max()` already runs on this model (`derive.ts:30-34`).
*Rejected:* caps in the shared contract; `.refine()`.
Serves: AC-27, AC-84, AC-85, AC-86, AC-87, AC-88.

### D3 — New module `modules/brief`, service built in its route
`routes`, `service`, `repository`, `helpers`, `prompt`, `constants`, plus
`src/prompts/brief.system.md`. The service takes `Container` and is
constructed in `routes.ts`, as blast is today; no container getter.
*Rejected:* reviewer-core (the spec keeps its behaviour, and another
session is editing `prompt.ts`).
Serves: AC-6, AC-11.

### D4 — Facts come from the services that already own them
`container.intent.get`, a new `container.blast`, `classifyFile`, and a new
`ProjectContextService.resolveForRepo`. `BlastService` changes to
`(BlastRepository, RepoIntel, flagOn)` so the container can build it. A
fact read that throws counts as missing and never fails a generation.
*Why:* `.dependency-cruiser.cjs:150` counts type-only imports, so a getter
for a service that takes `Container` adds a `no-circular` warning
(onion-architecture → *Dependency injection*).
*Rejected:* importing sibling modules; calling `repoIntel` directly (two
definitions of "the blast read").
Serves: AC-14, AC-16, AC-17, AC-18, AC-21, AC-22, AC-23, NFR-2.

### D5 — Documents: distinct `usage()` paths, sorted by code unit, through `planInjection`
Budget is `projectContextBudget`. Serves: AC-18, AC-19, AC-23, AC-24.

### D6 — Request layout
System message: the template, with the three caps interpolated. User
message: title, description, intent, blast and each document in its own
`wrapUntrusted` block; the changed-file list as one line per file (path,
role, `+a −d`, ranges). A document sits under a heading line with its full
path. Paths, symbol names and caller files pass a local `sanitizeInline`
(the character class of `prompt.ts:48-50`).
*Why:* the label cap would cut a long path (AC-18).
*Rejected:* exporting `safePath` from reviewer-core.
Serves: AC-13 to AC-18, AC-20, AC-88.

### D7 — Grounding is one pure function, `groundBrief`
Exact path match. A reference is parsed from its last `:n` or `:n-m`
suffix. References that collapse to the same path are deduplicated.
Serves: AC-26 to AC-32.

### D8 — "In flight" is an in-memory `Set<prId>` on the one service instance
Check and add with no `await` between them; cleared in `finally`.
*Why:* one API instance per database (`app.ts:78-79`).
*Rejected:* a DB flag (a migration, and a stuck flag after a crash).
Serves: AC-36, AC-37.

### D9 — Errors
`BriefFailedError` (502 `brief_failed`) wraps everything from
`container.llm()` to `completeStructured`; `AppError('brief_no_files', …, 422)`;
`AppError('brief_in_progress', …, 409)`. The upsert runs only after
grounding.
Serves: AC-33, AC-34, AC-35, AC-76, AC-87.

### D10 — The log line is a pure `briefLogFields(record)` plus one `req.log.info` in the POST route
*Why:* `buildApp` offers no logger injection (`app.ts:28-32`).
Serves: NFR-4.

### D11 — Seed fixture
`db/seed-brief.ts`: exported pure `seedBrief482(pr)` and insert-if-missing
`seedBrief(db, …)`, called after `seedIntent`. `intent` is the #482 intent
fixture, `blast` null, `specs_used` empty, model = the registry default,
tokens 1420 / 310, cost 0.0031 (never renders as `$0.014`). Summary:
"Adds a token-bucket rate limiter in front of the public API and applies
it to the Stripe webhook route, so unauthenticated clients can no longer
flood those endpoints. Limiter settings are added to the shared config,
and the user list endpoint now returns each user's organisations and
preferences." AC-94 quotes the summary, AC-92 the two risks and AC-93 the
three entries (§3.3). Every seeded value describes the seeded patch, not
the design fixture: the fixture's Redis risk is gone (`seed-diffs.ts:31`
says the limiter needs no Redis round-trip). Where the spec's text
differs from this plan's, the spec wins.
`DEMO_PR_FILES` gains `export`.
Serves: AC-89 to AC-95.

### D12 — Client composition
`BriefSummary`, `RiskAreas`, `ReviewFocus` under `PR/_components/`.
`IntentCard` gains `children`, rendered after a divider in all three
states. Hooks in `lib/hooks/brief.ts`, off the barrel.
*Why:* the design draws Risk areas inside the Intent card
(frontend-architecture → *Components*, `children` over a render prop).
*Rejected:* a second card in the left column; a container/view split.
Serves: AC-38 to AC-65.

### D13 — One control, two states
Idle: icon button, `aria-label` "Refresh brief". Pending: the same button,
disabled, visible text "Generating…", which is then also its accessible
name (AC-56 holds only while no generation is pending).
Serves: AC-42, AC-56, AC-80.

### D14 — Poll every 3,000 ms while `generating`
Serves: AC-64.

### D15 — Target in the URL: `?tab=diff&file=<path>&line=<n>`
Written with `router.replace`. A header tab change drops `file` and `line`.
`DiffTab` copies the target into local state on mount and clears it when
the order changes. Serves: AC-66, AC-74.

### D16 — Target plumbing is generic
`target` on `DiffViewer` and `FileCard`, `targeted` on `CodeLine`,
`forceOpen` on `RoleGroup`. A line matches on the new side only; a line
scroll wins over a card scroll; the mark is a style plus `aria-current`.
Serves: AC-67 to AC-72.

### D17 — Message keys in `brief.json`
The spec quotes every string; this fixes the keys. `block.risks` → "Risk
areas"; `missing.label` "Generated without: {inputs}" (AC-54);
`specsUsed` "Documents used" (AC-55); `focus.empty` "No starting point
was suggested." (AC-53); `readError` "Could not load the brief." (AC-62);
`targetMissing` "{path} is not in this PR's files." (AC-73). The one
string the spec leaves open is the severity text of NFR-7:
`risk.severity.high|medium|low` = "High severity", "Medium severity",
"Low severity", visually hidden. `unavailableHint` stays in the file,
unread.
Serves: AC-53, AC-54, AC-55, AC-62, AC-73, NFR-5, NFR-7.

### D19 — NFR-11 is proved where each rule is enforced
Delimiter blocks and character stripping in `buildBriefMessages` (T6);
exact path match in `groundBrief` (T5) and again in `DiffTab` before a
target is applied (T24); plain-text rendering in the three components
(T18 to T20), which render model strings as React text children and use
neither `Markdown` nor `dangerouslySetInnerHTML`.
*Rejected:* one catch-all test file (it would test nothing at its seam).
Serves: NFR-11.

### D18 — Flow 14 asserts absence with `wait --fn`
`wait --fn "!document.body.innerText.includes('Generate brief')"`; reload
with `reload`.
*Why:* a `wait` is the suite's assertion and no negative locator exists;
`wait --fn` is in the agent-browser README.
Serves: AC-96, AC-97, AC-98, NFR-8.

### D20 — The global rate limit becomes a setting; the e2e stack raises it
New env var `API_RATE_LIMIT_MAX` → `AppConfig.rateLimitMax`, a positive
integer, default **120**, empty string = default. `app.ts` registers the
plugin with `max: config.rateLimitMax`; the `nodeEnv !== 'test'` guard and
the one-minute window stay. `scripts/e2e.sh` exports
`API_RATE_LIMIT_MAX="${E2E_API_RATE_LIMIT_MAX:-10000}"` beside `API_PORT`,
and `.github/workflows/e2e-web.yml` sets `API_RATE_LIMIT_MAX: '10000'` in
its top-level `env:` block, because that workflow starts the API itself
and never runs `e2e.sh`. `make dev` and every other start keep 120.
*Why:* verified in code, 2026-10-03. `server/src/app.ts:95-97` registers
120 requests per minute whenever `nodeEnv` is not `test`; `scripts/e2e.sh`
exports `DATABASE_URL`, `API_PORT`, `WEB_PORT` and no `NODE_ENV`, so the
API runs as `development` (`config.ts`, `NODE_ENV` default) with the
limiter on; every flow's browser is one client, `127.0.0.1`. The suite is
one budget, so each added flow moves all of them toward it: 13 flows fit,
14 do not. The request count itself (127) is test-writer's log reading and
was not re-measured here. A route's own `config.rateLimit` replaces the
global `max` for that route, so the 10 per minute of NFR-1 is untouched.
*Rejected:* `NODE_ENV=test` for the e2e API (it unregisters the plugin, so
the per-route limits vanish too, and it silences the log the diagnosis
came from, `config.ts` `logLevel`); pacing the runner (slower on every
run, and the margin shrinks with each new flow); an allow-list for
`127.0.0.1` (the API binds to loopback, so that is every real client);
raising the default (it changes the product for a test's sake).
Serves: AC-96, AC-97, AC-98, NFR-1, NFR-9.

## 3. Tasks

Test IDs are a file prefix plus a number; titles are quoted for grep.

### 3.1 Slice A — Contracts and copy
Files: `{client,server}/src/vendor/shared/contracts/brief.ts` and
`contracts/platform.ts` (both copies, identical),
`server/test/contracts.test.ts`,
`server/test/settings-models.it.test.ts:41,70-73`,
`client/messages/en/brief.json` (merge, never replace a block),
`client/src/test/messages.ts`, `client/src/test/brief-messages.test.ts`.
Depends on: nothing.

- [x] T1 `ReviewFocusItem`; `PrBrief` gains `summary`, `review_focus`, nullable `intent` and `blast` → AC-1, AC-2 → K1, K2
- [x] T2 `BriefMissingInput`, `PrBriefStored`, `PrBriefRecord`, `PrBriefResponse` → AC-4, AC-6, NFR-3 → K4
- [x] T3 `risk_brief` default → `openrouter` / `anthropic/claude-haiku-4.5`; update the existing assertion → AC-81, AC-82, AC-83 → K5, M1
- [x] T4 identity assertion for `brief.ts` and `platform.ts` → AC-3, AC-82 → K3
- [x] T17 every new `brief.json` key (D17); export `brief` from the test messages → AC-38, NFR-5 → N1

Tests — `server/test/contracts.test.ts`:
K1 "PrBrief carries summary and review_focus items with file, line and reason" ·
K2 "PrBrief accepts null intent and null blast" ·
K3 "brief.ts and platform.ts are byte-identical in both vendored copies" ·
K4 "PrBriefRecord and PrBriefResponse parse the External contracts shapes" ·
K5 "risk_brief defaults to openrouter and anthropic/claude-haiku-4.5".
`server/test/settings-models.it.test.ts`: M1 "resolveFeatureModel: registry default until overridden, then the workspace choice" (existing, new value).
`client/src/test/brief-messages.test.ts`: N1 "brief.json keeps every key the Intent and Blast radius cards read".

### 3.2 Slice B — Server: the brief module
Files: `server/src/modules/brief/{routes,service,repository,helpers,prompt,constants}.ts`,
`helpers.test.ts`, `prompt.test.ts`, `server/src/prompts/brief.system.md`,
`server/src/modules/index.ts`, `server/src/modules/blast/{service,routes}.ts`,
`server/src/platform/container.ts`,
`server/src/modules/project-context/service.ts`,
`server/test/brief.it.test.ts`. Depends on: A.

- [x] T5 `changedRanges`, `parseFileRef`, `groundBrief`, `isBlastAvailable`, `toRecord` → AC-8, AC-15, AC-17, AC-22, AC-26 to AC-32, NFR-11 → H1 to H10, H12, H13
- [x] T6 `BriefOutput`, caps, template, `buildBriefMessages` (D6) → AC-13 to AC-18, AC-20, AC-84, AC-85, AC-86, AC-88, NFR-11 → P1 to P11
- [x] T7 `BlastService` takes its ports; `container.blast`; the blast route uses it → AC-17 → `server/test/blast.it.test.ts` (unchanged, green), B10
- [x] T8 `resolveForRepo(repo)` (D5), sharing the read step of `resolveForRun` → AC-18, AC-19 → B10, B11
- [x] T9 repository: pull, repo, files, `get`, `upsert` on conflict → AC-4, AC-5 → B2, B3
- [x] T10 `service.get`: 404, parse with `PrBriefStored`, `stale`, `generating` → AC-6, AC-7, AC-9, AC-10, AC-37 → B1, B4 to B7
- [x] T11 `service.generate`: facts, `missing_inputs`, one call, grounding, record, upsert → AC-11, AC-12, AC-21 to AC-25, AC-31, NFR-2 → B8 to B15, B21
- [x] T12 failure and in-flight paths (D8, D9) → AC-33 to AC-36, AC-76, AC-87 → B16 to B20
- [x] T13 routes with response schemas (200, 404, 409, 422, 500, 502), 10 per minute, the log line; register the module → AC-9, NFR-1, NFR-3, NFR-4 → B6, B22, B23, H11

Tests — `server/src/modules/brief/helpers.test.ts`:
H1 "changedRanges reads the new-side range of each hunk header and skips a zero-length hunk" ·
H2 "parseFileRef splits path, path:line and path:start-end" ·
H3 "groundBrief omits a review_focus item whose file is not a changed file" ·
H4 "groundBrief omits a review_focus item whose line is outside every changed range" ·
H5 "groundBrief removes a file reference that names no changed file" ·
H6 "groundBrief omits a risk left with no file reference" ·
H7 "groundBrief keeps the path alone when the lines overlap no changed range" ·
H8 "groundBrief counts omitted risks and review_focus items" ·
H9 "groundBrief keeps review_focus in the model's order" ·
H10 "isBlastAvailable is true with a changed symbol or status ok" ·
H11 "briefLogFields carries pr id, model, tokens, cost, missing_inputs and dropped" ·
H12 "toRecord marks the brief stale when head_sha differs from the PR head" ·
H13 "groundBrief matches a path exactly: a ./ or a/ prefix, a different case or a trailing space is not a changed file".
`server/src/modules/brief/prompt.test.ts`:
P1 "BriefOutput accepts a summary of 1 to 400 characters" ·
P2 "BriefOutput accepts at most 6 risks" ·
P3 "BriefOutput accepts at most 6 review_focus items" ·
P4 "the system message states the three caps" ·
P5 "title and description sit in untrusted blocks" ·
P6 "each changed file is listed with path, role, additions and deletions" ·
P7 "a file with a patch lists its changed ranges as numbers, a file without one lists none" ·
P8 "no added, removed or context line of a patch reaches the request" ·
P9 "intent, blast and documents appear only when supplied" ·
P10 "paths, symbol names and caller files lose delimiter and line-break characters" ·
P11 "intent text and each document's text sit in their own untrusted blocks, and a body cannot close its delimiter".
`server/test/brief.it.test.ts` (mock LLM, `MockSecretsProvider`, real Postgres):
B1 "GET returns brief null and generating false before any generation" ·
B2 "POST stores the brief with head_sha, model, tokens and cost inside pr_brief.json" ·
B3 "a second POST replaces the stored brief and leaves one row" ·
B4 "GET returns the stored record and makes zero model calls" ·
B5 "GET marks the brief stale after the PR head moves" ·
B6 "GET and POST are 404 for a PR outside the workspace" ·
B7 "stored JSON that fails the contract reads as brief null" ·
B8 "one generation records exactly one completeStructured call and no other model call" ·
B9 "generation uses the risk_brief default, then the workspace's choice" ·
B10 "with intent, blast and documents the request carries all three, missing_inputs is empty and specs_used lists the documents" ·
B11 "documents are included in path order, whole, until the budget is reached" ·
B12 "no stored intent: generated with intent null and intent listed as missing" ·
B13 "blast missing: generated with blast null and blast listed as missing" ·
B14 "no document included: generated with specs listed as missing" ·
B15 "ungrounded entries are dropped and counted in the stored brief" ·
B16 "a failing model call is 502 brief_failed and leaves the stored brief unchanged" ·
B17 "a missing provider key is 502 brief_failed naming OPENROUTER_API_KEY" ·
B18 "output over a cap is 502 brief_failed and stores nothing" ·
B19 "a PR with zero changed files is 422 brief_no_files with no model call" ·
B20 "a request during a generation is 409 brief_in_progress, GET reports generating, one model call in total" ·
B21 "reading and generating make no GitHub request" ·
B22 "responses parse against the shared contracts and an invalid id is 422" ·
B23 "the 11th generation request in a minute is 429".

Notes for test-writer: B20 uses a test-local subclass of `MockLLMProvider`
that awaits a gate. B23 builds the app with `nodeEnv: 'production'` and
`logLevel: 'silent'` (§1, `app.ts:95-97`) and posts an unknown uuid, so
the first ten are 404 and no model is called. B21 injects a `GitHubClient`
whose every method throws.

### 3.3 Slice C — Server: demo seed
Files: `server/src/db/seed-brief.ts`, `server/src/db/seed.ts` (`:32`
export, one call after `:528`), `server/test/seed-fixtures.test.ts`,
`server/test/brief.it.test.ts`. Depends on: A, B (T5).

Risks of the fixture, in this order (AC-92; explanations are copied
verbatim from the spec):

| Kind | Severity | Title | File reference |
|---|---|---|---|
| `security` | `high` | Auth surface touched | `src/api/public/webhooks.ts:9-19` |
| `perf` | `medium` | In-process buckets grow without bound | `src/middleware/ratelimit.ts:16` |

Review focus entries of the fixture, in this order (AC-93):

| Entry | Reason |
|---|---|
| `src/config.ts:12` | live Stripe key (sk_live_…) committed in plaintext |
| `src/middleware/ratelimit.ts:71` | 429 branch sends the reply with no return after it |
| `src/api/users.ts:46` | N+1 query — one orgs lookup and one prefs lookup per user |

All five references sit inside the seeded ranges (§1: webhooks 1–39,
ratelimit 1–84, config 8–15, users 42–52), so S1 expects nothing dropped.

- [x] T14 `seedBrief482(pr)`: the two risks above, in order, with the kind, severity, title, explanation and file reference AC-92 quotes; the three entries above, in order, with those reasons; the summary AC-94 quotes; `blast` and `specs` missing → AC-92, AC-93, AC-94, AC-95 → S1 to S5
- [x] T15 `seedBrief`: insert only when #482 has no row, with the row's head SHA → AC-89, AC-90, AC-91, AC-95 → B24, B25

Tests — `server/test/seed-fixtures.test.ts`:
S1 "the #482 brief fixture passes groundBrief against the seeded patches unchanged" ·
S2 "the #482 brief fixture holds the two risks AC-92 quotes, in order, with kind, severity, title, explanation and file reference" ·
S5 "the #482 brief fixture holds the three Review focus entries AC-93 quotes, in order, each on a new-side line of its seeded patch" ·
S3 "the #482 brief summary is the text AC-94 quotes, at most 400 characters, and shares no sentence with the seeded review summary" ·
S4 "the #482 brief fixture satisfies PrBriefStored and lists blast and specs as missing".
`server/test/brief.it.test.ts`:
B24 "seeded #482 has a brief with the PR's head_sha" ·
B25 "re-running the seed keeps a brief the user generated".

### 3.4 Slice D — Client: the PR Brief section
Files: `client/src/lib/hooks/brief.ts` + `brief.test.ts`,
`PR/_components/{BriefSummary,RiskAreas,ReviewFocus}/` (component,
`styles.ts`, `index.ts`, test; `RiskAreas/constants.ts`),
`PR/_components/IntentCard/IntentCard.tsx`,
`PR/_components/OverviewTab/{OverviewTab.tsx,styles.ts,OverviewTab.test.tsx}`,
`…/SettingsModels/SettingsModels.test.tsx`. Depends on: A.

- [x] T16 `usePrBrief` (poll while generating), `useGenerateBrief` (writes the cache on success) → AC-41, AC-43, AC-44, AC-60, AC-64 → Q1 to Q4
- [x] T18 `BriefSummary`: skeleton, read error, empty, stored, generating; missing inputs, documents used, model and cost, stale note, inline error → AC-38, AC-41 to AC-45, AC-54 to AC-63, AC-65, AC-75, AC-78, AC-79, AC-80, NFR-5, NFR-7, NFR-11 → U1 to U17
- [x] T19 `RiskAreas` (icon by kind, colour by severity, severity text, refs as text with `title`); `IntentCard` `children` → AC-48 to AC-51, NFR-6, NFR-7, NFR-11 → R1 to R6
- [x] T20 `ReviewFocus`: count, one button per entry, empty line, `onOpen(file, line)` → AC-52, AC-53, AC-66, AC-77, NFR-6, NFR-7, NFR-11 → F1 to F6
- [x] T21 `OverviewTab`: banner or note → `BriefSummary` → grid (Risk areas inside Intent) → `ReviewFocus`; optional `onOpenFile` prop → AC-39, AC-40, AC-45 to AC-48, AC-52 → O1 to O4
- [x] T22 lock the Settings default → AC-83 → V1

Tests — `client/src/lib/hooks/brief.test.ts`:
Q1 "usePrBrief reads GET /pulls/:id/brief and never posts" ·
Q2 "useGenerateBrief posts once and writes the returned brief into the cache" ·
Q3 "while a read reports generating the brief is read again within 4 seconds" ·
Q4 "a failed generation leaves the cached brief unchanged".
`BriefSummary/BriefSummary.test.tsx`:
U1 "no brief: shows Brief not available yet. and a Generate brief button" ·
U2 "Generate brief sends one generation request" ·
U3 "pending: the control is disabled and labelled Generating…" ·
U4 "a stored brief shows its summary paragraph and sends no generation request" ·
U5 "the Refresh brief control sits at the end of the summary block and sends one request" ·
U6 "a pending refresh keeps the brief visible" ·
U7 "a failed generation shows the API message and enables the control again" ·
U8 "a failed refresh keeps the previous brief" ·
U9 "loading shows a skeleton in place of the summary" ·
U10 "a failed read shows an error state with a retry control" ·
U11 "a stale brief shows the stale note beside the refresh control" ·
U12 "generating true shows the generating state" ·
U13 "names each missing input" ·
U14 "lists the documents used" ·
U15 "shows the model slug and the cost" ·
U16 "generate and refresh are buttons and the old hint is not shown" ·
U17 "markup in a summary renders as text, not as elements".
`RiskAreas/RiskAreas.test.tsx`:
R1 "lists each risk's title and file references under Risk areas" ·
R2 "colours each icon by severity" ·
R3 "draws the icon by kind and a default for an unknown kind" ·
R4 "zero risks shows No notable risks flagged." ·
R5 "severity is available as text and a file reference carries its full text as title" ·
R6 "markup in a risk title or file reference renders as text, and a file reference is not a link".
`ReviewFocus/ReviewFocus.test.tsx`:
F1 "one row per entry as file:line — reason, in stored order" ·
F2 "shows the number of entries beside the label" ·
F3 "zero entries shows the no-starting-point line" ·
F4 "activating an entry reports its file and line" ·
F5 "each entry is a button and its path carries its full text as title" ·
F6 "markup in a reason or path renders as text, not as elements".
`OverviewTab/OverviewTab.test.tsx`:
O1 "no brief: Intent and Blast radius render, Risk areas and Review focus do not" ·
O2 "with a brief: summary between the banner and the grid, Risk areas below Intent, Review focus below the grid" ·
O3 "with a review the banner shows the review's summary, with or without a brief" ·
O4 "without a review the Not reviewed yet note shows, with or without a brief".
`SettingsModels/SettingsModels.test.tsx`: V1 "shows anthropic/claude-haiku-4.5 for Risk Brief when the workspace has chosen none".

### 3.5 Slice E — Client: Files changed target
Files: `PR/helpers.ts` + `helpers.test.ts` (new, route rung), `PR/page.tsx`,
`PR/_components/DiffTab/{DiffTab.tsx,styles.ts,DiffTab.test.tsx}`,
`PR/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx`,
`client/src/components/diff-viewer/{DiffViewer/DiffViewer.tsx,FileCard/FileCard.tsx,FileCard/FileCard.test.tsx,CodeLine/CodeLine.tsx,styles.ts}`.
Depends on: A (T17 copy). T23 also needs T21's prop.

- [x] T23 `focusTargetQuery`, `parseDiffTarget`, tab change drops the target; the page wires `onOpenFile` and passes `target` to `DiffTab` → AC-66, AC-74 → G1, G2, G3
- [x] T24 `DiffTab`: resolve the target against `files`, notice when unknown, local copy cleared on order change, pass it to groups and the flat list → AC-70, AC-73, NFR-11 → X4, X7
- [x] T25 `RoleGroup` opens when it holds the target → AC-67 → X1
- [x] T26 `FileCard` opens and scrolls for a target; `CodeLine` marks and scrolls the target line → AC-68, AC-69, AC-71, AC-72 → X2, X3, X5, X6, C1

Tests — `PR/helpers.test.ts`:
G1 "focusTargetQuery sets tab=diff, file and line and keeps other params" ·
G2 "parseDiffTarget reads file and line, and a missing or invalid line is null" ·
G3 "changing tab drops file and line".
`DiffTab/DiffTab.test.tsx` (stub `Element.prototype.scrollIntoView`):
X1 "Smart order: a target in a collapsed group expands the group" ·
X2 "a target file over the auto-expand limit is expanded" ·
X3 "the target card is scrolled into view" ·
X4 "Original order: the target card is expanded and in view in the flat list" ·
X5 "a rendered target line is marked and scrolled into view" ·
X6 "an unrendered target line marks nothing and scrolls to the card" ·
X7 "an unknown target file shows a notice naming the path and applies no target".
`FileCard/FileCard.test.tsx`: C1 "a target opens the card over startClosed and the size cap".

### 3.6 Slice F — E2E
Files: `e2e/specs/14-pr-brief.flow.json`,
`e2e/.context/docs/seed-contract.md` (both written, uncommitted); for T29:
`server/src/platform/config.ts`, `server/src/app.ts:95-97`,
`server/.env.example`, `scripts/e2e.sh`, `.github/workflows/e2e-web.yml`,
`e2e/README.md:81-87` (one env-knob line),
`server/test/rate-limit-config.test.ts`, `server/test/rate-limit.it.test.ts`.
Depends on: C, D, E. Order inside the slice: T29, then T27 and T28.

State on 2026-10-03: with flows 01 to 13 unchanged and green, flow 14
fails at step 12 ("the seeded summary is still there after the reload")
because the reload's `GET /repos` and `GET /repos/:id/pulls` answer 429.
Its later steps are unproven until T29 lands. The flow file is not at
fault and is not to be reshaped around the limit.

- [x] T29 `API_RATE_LIMIT_MAX` → `AppConfig.rateLimitMax` (default 120); `app.ts` reads it; `e2e.sh` and the workflow set 10000; document the knob (D20) → AC-96, AC-97, AC-98, NFR-1, NFR-9 → L1, L2, L3, then E1 green in `make e2e`
- [x] T27 flow 14: open #482 → wait for the summary's first clause, "Auth surface touched", `src/config.ts:12` → `reload` → summary again, then D18's `wait --fn` → `find role button click --name "src/config.ts:12"` → `wait --url tab=diff` → `wait --text "rateLimitWindowMs: 60_000"` → AC-96, AC-97, AC-98, NFR-8 → E1
- [x] T28 one seed-contract row per value T27 waits for, and a note that the brief's cost never renders as `$0.014`; run the whole suite → NFR-9, NFR-10 → `make e2e`

T27 waits on "Auth surface touched" (the first seeded risk, AC-92) and on
`src/config.ts:12` (the first seeded entry, AC-93). It waits on neither
the second risk's title nor the `ratelimit.ts:71` entry, so the flow's
steps are the same as before the AC-92 and AC-93 rewording.

Test — E1 `e2e/specs/14-pr-brief.flow.json` "PR Overview shows the seeded
brief, keeps it on reload and opens a Review focus entry on Files changed".
Put `wait --load networkidle` before each `find` (e2e INSIGHTS). If
`reload` is not a command of the installed CLI, use
`eval "location.reload()"`.

Tests for T29 — `server/test/rate-limit-config.test.ts` (unit lane, no app):
L1 "API_RATE_LIMIT_MAX defaults to 120, is overridable, and an empty value falls back to the default".
`server/test/rate-limit.it.test.ts` (real Postgres, as B23 builds its app:
`nodeEnv: 'production'`, `logLevel: 'silent'`; never `buildApp` without the
fixture's `db`, which would run the boot reaper against the dev database):
L2 "the global limit follows rateLimitMax: with a max of 3 the fourth request in a minute is 429" ·
L3 "a raised global limit leaves the brief generation route at 10 per minute".
L2 and L3 send requests that end in 404 or 422, so no model is called.
The workflow edit has no local test: `e2e-web.yml` is `workflow_dispatch`
only. Its proof is the next manual run from the Actions tab.

## 4. Traceability

| AC | Task | Test | Commit |
|---|---|---|---|
| AC-1 | T1 | K1 | dba8f5e |
| AC-2 | T1 | K2 | dba8f5e |
| AC-3 | T4 | K3 | dba8f5e |
| AC-4 | T2, T9, T11 | B2 | dba8f5e, 0a5f5d1 |
| AC-5 | T9 | B3 | 0a5f5d1 |
| AC-6 | T2, T10 | B1, B4 | dba8f5e, 0a5f5d1 |
| AC-7 | T10 | B4 | 0a5f5d1 |
| AC-8 | T5, T10 | H12, B5 | 0a5f5d1 |
| AC-9 | T10, T13 | B6 | 0a5f5d1 |
| AC-10 | T10 | B7 | 0a5f5d1 |
| AC-11 | T11 | B8 | 0a5f5d1 |
| AC-12 | T11 | B9 | 0a5f5d1 |
| AC-13 | T6 | P5 | 0a5f5d1 |
| AC-14 | T6 | P6, P10 | 0a5f5d1 |
| AC-15 | T5, T6 | H1, P7 | 0a5f5d1 |
| AC-16 | T6, T11 | P9, B10 | 0a5f5d1 |
| AC-17 | T5, T6, T7, T11 | H10, P9, P10, B10 | 0a5f5d1 |
| AC-18 | T6, T8, T11 | P9, B10 | 0a5f5d1 |
| AC-19 | T8 | B11 | 0a5f5d1 |
| AC-20 | T6 | P8 | 0a5f5d1 |
| AC-21 | T11 | B12 | 0a5f5d1 |
| AC-22 | T5, T11 | H10, B13 | 0a5f5d1 |
| AC-23 | T11 | B14 | 0a5f5d1 |
| AC-24 | T11 | B10 | 0a5f5d1 |
| AC-25 | T11 | B2 | 0a5f5d1 |
| AC-26 | T5 | H3, B15 | 0a5f5d1 |
| AC-27 | T5 | H4 | 0a5f5d1 |
| AC-28 | T5 | H5 | 0a5f5d1 |
| AC-29 | T5 | H6 | 0a5f5d1 |
| AC-30 | T5 | H7 | 0a5f5d1 |
| AC-31 | T5, T11 | H8, B15 | 0a5f5d1 |
| AC-32 | T5 | H9 | 0a5f5d1 |
| AC-33 | T12 | B16 | 0a5f5d1 |
| AC-34 | T12 | B16 | 0a5f5d1 |
| AC-35 | T12 | B19 | 0a5f5d1 |
| AC-36 | T12 | B20 | 0a5f5d1 |
| AC-37 | T10, T12 | B20 | 0a5f5d1 |
| AC-38 | T17, T18 | U1 | dba8f5e, 57fc2d4 |
| AC-39 | T21 | O1 | 57fc2d4 |
| AC-40 | T21 | O1, O2 | 57fc2d4 |
| AC-41 | T16, T18 | Q2, U2 | 57fc2d4 |
| AC-42 | T18 | U3 | 57fc2d4 |
| AC-43 | T16, T18 | Q2, U4 | 57fc2d4 |
| AC-44 | T16, T18 | Q1, U4 | 57fc2d4 |
| AC-45 | T18, T21 | U4, O2 | 57fc2d4 |
| AC-46 | T21 | O3 | 57fc2d4 |
| AC-47 | T21 | O4 | 57fc2d4 |
| AC-48 | T19, T21 | R1, O2 | 57fc2d4 |
| AC-49 | T19 | R2 | 57fc2d4 |
| AC-50 | T19 | R3 | 57fc2d4 |
| AC-51 | T19 | R4 | 57fc2d4 |
| AC-52 | T20, T21 | F1, O2 | 57fc2d4 |
| AC-53 | T20 | F3 | 57fc2d4 |
| AC-54 | T18 | U13 | 57fc2d4 |
| AC-55 | T18 | U14 | 57fc2d4 |
| AC-56 | T18 | U5 | 57fc2d4 |
| AC-57 | T18 | U5 | 57fc2d4 |
| AC-58 | T18 | U6 | 57fc2d4 |
| AC-59 | T18 | U7 | 57fc2d4 |
| AC-60 | T16, T18 | Q4, U8 | 57fc2d4 |
| AC-61 | T18 | U9 | 57fc2d4 |
| AC-62 | T18 | U10 | 57fc2d4 |
| AC-63 | T18 | U11 | 57fc2d4 |
| AC-64 | T16 | Q3 | 57fc2d4 |
| AC-65 | T18 | U15 | 57fc2d4 |
| AC-66 | T20, T23 | F4, G1, E1 | 57fc2d4, 8e7dda4 |
| AC-67 | T25 | X1 | 8e7dda4 |
| AC-68 | T26 | X2, C1 | 8e7dda4 |
| AC-69 | T26 | X3 | 8e7dda4 |
| AC-70 | T24 | X4 | 8e7dda4 |
| AC-71 | T26 | X5 | 8e7dda4 |
| AC-72 | T26 | X6 | 8e7dda4 |
| AC-73 | T24 | X7 | 8e7dda4 |
| AC-74 | T23 | G1, G2, G3 | 8e7dda4 |
| AC-75 | T18 | U7 | 57fc2d4 |
| AC-76 | T12 | B17 | 0a5f5d1 |
| AC-77 | T20 | F2 | 57fc2d4 |
| AC-78 | T18 | U12 | 57fc2d4 |
| AC-79 | T18 | U1 | 57fc2d4 |
| AC-80 | T18 | U5 | 57fc2d4 |
| AC-81 | T3 | K5, M1 | dba8f5e |
| AC-82 | T3, T4 | K3 | dba8f5e |
| AC-83 | T3, T22 | V1 | dba8f5e, 57fc2d4 |
| AC-84 | T6 | P1 | 0a5f5d1 |
| AC-85 | T6 | P2 | 0a5f5d1 |
| AC-86 | T6 | P3 | 0a5f5d1 |
| AC-87 | T12 | B18 | 0a5f5d1 |
| AC-88 | T6 | P4 | 0a5f5d1 |
| AC-89 | T15 | B24 | e0b403d |
| AC-90 | T15 | B25 | e0b403d |
| AC-91 | T15 | B24 | e0b403d |
| AC-92 | T14 | S1, S2 | e0b403d |
| AC-93 | T14 | S1, S5 | e0b403d |
| AC-94 | T14 | S3 | e0b403d |
| AC-95 | T14, T15 | S4, B24 | e0b403d |
| AC-96 | T27, T29 | E1 | b6d40cc, cb75248 |
| AC-97 | T27, T29 | E1 | b6d40cc, cb75248 |
| AC-98 | T27, T29 | E1 | b6d40cc, cb75248 |
| NFR-1 | T13, T29 | B23, L3 | 0a5f5d1, b6d40cc |
| NFR-2 | T11 | B21 | 0a5f5d1 |
| NFR-3 | T2, T13 | K4, B22 | dba8f5e, 0a5f5d1 |
| NFR-4 | T13 | H11 | 0a5f5d1 |
| NFR-5 | T17, T18 | N1, U16 | dba8f5e, 57fc2d4 |
| NFR-6 | T19, T20 | R5, F5, manual check at 1080 px (§6) | 57fc2d4 |
| NFR-7 | T18, T19, T20 | U16, R5, F5 | 57fc2d4 |
| NFR-8 | T27 | E1 (only `open`, `wait`, `find`, `reload`) | cb75248 |
| NFR-9 | T28, T29 | L1, L2; `make e2e` green with 14 flows; `git diff --stat e2e/specs` shows flow 14 only | b6d40cc, cb75248 |
| NFR-10 | T28 | each value E1 waits for is a row of `seed-contract.md` | cb75248 |
| NFR-11 | T5, T6, T18, T19, T20, T24 | H13, P5, P10, P11, U17, R6, F6, X7 | 57fc2d4, 8e7dda4, 0a5f5d1 |

## 5. Execution

    A ──┬── B ── C ──┐
        ├── D ───────┼── F
        └── E ───────┘        (T23 after T21)

- A first: it freezes the contracts and the copy that B, D and E share.
- Parallel group (disjoint files): B (server), D (Overview components,
  hooks), E (page, DiffTab, diff-viewer). T23 edits `page.tsx` against
  `OverviewTab`'s new prop, so it runs after T21.
- C after B: S1 imports `groundBrief`.
- F last. Inside F: T29 first, as its own commit (it changes `server/`,
  `scripts/` and `.github/`, none of which the flow commit touches), then
  T27 and T28 in one commit once `make e2e` is green with 14 flows.
- Mode chosen by the user on 2026-10-03: multi-agent. A; then B, D
  (T16 to T22) and E (T24 to T26) in parallel; then C; then T23; then F.
  One commit per landed slice; T23 lands with slice E's commit or as its
  own.
- Another session commits to this branch. B edits
  `project-context/service.ts` and `platform/container.ts`: read both at
  HEAD before editing. No slice touches `reviewer-core/src/prompt.ts` or
  `client/src/app/agents/`.
- No dependency is added and no migration is generated.
- Not planned, no criterion asks for it: README route maps, the e2e
  coverage table, any `mcp/` change.

## 6. Verification

- `make typecheck` · `make lint` (client 0 errors / 52 warnings, server
  0 / 0) · `make lint-arch` (0 errors / 18 warnings; by rule, still 8
  `no-circular` and 10 `persistence-in-service`).
- `make test` after every slice; `make test-it` after B and C (Docker).
- `make check` before plan-verifier, with `make dev` stopped so
  `build-web` runs: T16 adds value imports of Zod schemas.
- `make e2e` after F (`cd e2e && npm ci` once). After T29 it must end
  with 14 of 14 flows green and no `statusCode: 429` line in the API log;
  `make test` and `make test-it` carry L1 to L3. A plain `make dev` start
  still logs the 120-per-minute default, which L1 pins.
- `diff -r client/src/vendor/shared server/src/vendor/shared` still lists
  only `adapters.ts` and `contracts/{eval-ci,knowledge,productionize,trace}.ts`.
- `git status server/src/db/migrations` is clean.
- Manual, by the user: NFR-6 at a 1080 px content width with 6 risks and
  6 entries; one live generation on a cloned, indexed repository with an
  attached document (spec, "How the outcomes are observed", last bullet).
