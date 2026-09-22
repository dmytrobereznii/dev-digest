# 07 — Intent Layer

**Lesson:** L03 (Intent layer; Smart Diff is the other half and is **not** in this spec) | **Scope:** repo-wide (reviewer-core, server, client, both `vendor/shared` copies, e2e)
**Status:** ready
**Goal:** Work out what a PR is *for* from its title, its description, the
linked issue and any plan or spec the description links to. Store that intent
with a confidence the code computes. Show it on the PR Overview tab as the
design's Intent block, and pass it to every reviewer agent next to the diff so
the agent can flag scope drift and in-scope items the diff misses. Extraction
runs on a separate cheap model, chosen under Settings → Feature Models. When the
author documented nothing, the intent is inferred from commits, the branch,
paths and the diff, and it is marked **low confidence** both in the UI and in
the reviewer prompt.

Built from the artboards and live code only. Removed implementations in git
history are off-limits (root INSIGHTS, 2026-09-16).

## Design reference

Bundle `designs_with_skills.html`, extracted 2026-09-20. Both greps were run
(`IntentBlock` and case-insensitive `intent`/`scope`). That leaves **2 surfaces
+ 2 fixture uses**. `screen_agents.jsx:91` ("intentional"),
`screen_memory.jsx` (memory scope) and `screen_tour_context.jsx` (task scope)
were checked and are not about PR intent. `screen_conv_conf.jsx:140` "Scope
creep" belongs to the N8 Conformance Report, which is out of scope here.

| Surface | What it contributes |
|---|---|
| `src/screen_pr_detail.jsx:3-19` → `IntentBlock` | an italic quoted one-line intent (14px); a two-column grid: **IN SCOPE** (`var(--ok)`, `Check` icon, `·` bullets in `--text-secondary`) and **OUT OF SCOPE** (`--text-muted`, `X` icon). Headers are 11px/700/`letterSpacing 0.04em` |
| `src/screen_pr_detail.jsx:70-71` → `BriefCard` | `SectionLabel icon="Target"` "Intent" above `IntentBlock`, in the left `Card` of the PR Brief, all under `OverviewTab`'s `SectionLabel icon="FileText"` "PR Brief" (artboard `pr-overview`, `canvas/canvas.jsx:42`) |
| `src/data.jsx:28-40` → `INTENT` | fixture shape `{ intent, in_scope[], out_of_scope[] }`, which is exactly the live `Intent` contract |
| `src/data.jsx:106-110` → finding `f4` | the finding this feature exists to produce: its rationale cites the stated in-scope item ("Return 429 with `Retry-After` header") at the line that fails it |
| `src/data.jsx:237-239` → "Scope" checklist | "Does the diff stay within the stated intent? Flag out-of-scope changes separately rather than blocking." This is the reviewer's instruction (D8) |

The design has **no** confidence indicator, sources list, empty state or
re-derive control. D11 adds minimal versions built from existing tokens and
says so.

---

## 1. What already ships

| Layer | Fact | Where |
|---|---|---|
| Contract | `Intent = { intent, in_scope[], out_of_scope[] }`; `PrBrief.intent` uses it | `server/src/vendor/shared/contracts/brief.ts:9-14,116-121` (client copy identical) |
| Contract | `PrIntentRecord = Intent.extend({ pr_id })`, used nowhere | `server/src/vendor/shared/contracts/review-api.ts:61-63` (identical in client) |
| DB | `pr_intent` table: `pr_id` PK/FK cascade, `intent`, `in_scope`/`out_of_scope` jsonb | `server/src/db/schema/reviews.ts:63-70` |
| Repo | `upsertIntent` / `getIntent`, **no callers** | `server/src/modules/reviews/repository/pull.repo.ts:47-68`, `reviews/repository.ts:130-138` |
| Feature model | `'review_intent'` is already a `FeatureModelId` ("PR Review · Intent"). Its default is **`openai`/`gpt-4.1`**, which is not cheap | `contracts/platform.ts:15-21,52-58` (both copies) |
| Feature model | `resolveFeatureModel(container, ws, id)`: the workspace override, else the registry default | `server/src/modules/settings/feature-models.ts:51-57`; precedent caller `modules/conventions/service.ts:139` |
| Settings UI | Settings → Feature Models already renders a picker per `FEATURE_MODELS` entry and saves `{ provider: 'openrouter', model }` | `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:20-75` |
| Settings UI | That picker reads a **client-side mirror** of the registry, and the mirror has **drifted**: `conventions` is `openai/gpt-5.4` here and `openrouter/anthropic/claude-haiku-4.5` in shared. Its header comment says value imports break webpack, which no longer holds (`next.config.mjs` `extensionAlias`, client INSIGHTS 2026-09-20) | `client/src/lib/feature-models.ts:1-49` |
| LLM | `container.llm(id)` → `completeStructured({ model, schema, schemaName, messages, timeoutMs, maxRetries })` → `{ data, tokensIn, tokensOut, costUsd }`. OpenRouter cost comes from `usage.cost`, then `PriceBook.estimate`, then `null` | `platform/container.ts:175-205`, `vendor/shared/adapters.ts:55-88`, `reviewer-core/.context/docs/cost-accounting.md` |
| GitHub | `GitHubClient.getIssue(repo, n)` → `IssueMeta { number, title, body, state }`, with 30 s timeout and retry | `adapters/github/octokit.ts:351-364`, port `vendor/shared/adapters.ts:164` |
| GitHub | The importer resolves a linked issue with `/(?:closes\|fixes\|resolves)?\s*#(\d+)/i` but **does not persist it**. `GET /pulls/:id` returns it only on the live path, and the offline branch drops it | `octokit.ts:91,127-135`; `modules/pulls/routes.ts:271` vs `:276-303`; no column in `schema/pulls.ts:5-34` |
| PR data | `pull_requests.title/body/branch/head_sha`, `pr_commits.message`, `pr_files.path/additions/deletions/patch` are all persisted | `schema/pulls.ts` |
| Git | `SimpleGitClient.readFile(repo, path)` = `readFile(join(clonePath, path))`, with **no containment check** | `adapters/git/simple-git.ts:129-131` |
| Engine | `assemblePrompt` has optional slots, each omitted when absent. User sections go: task → `## PR description` (wrapped, 4000-char cap) → skills → memory → repo map → specs → callers → diff | `reviewer-core/src/prompt.ts:55,145-166` |
| Engine | `INJECTION_GUARD` **already names "derived intent/scope"** as untrusted data and says stated intent can never descope a real defect | `reviewer-core/src/prompt.ts:16-28` |
| Engine | `reviewPullRequest` does "no … intent": the caller resolves it | `reviewer-core/src/review/run.ts:20-28` |
| Executor | Loads the diff once for all agents as shared pre-work, then runs each agent. Comments already reserve "diff + intent" pre-work | `modules/reviews/run-executor.ts:62-106,149-151,311-313` |
| Trace | `PromptAssembly` has per-slot fields (`callers`, `repo_map`, `pr_description`) | `server/src/vendor/shared/contracts/trace.ts:39-52` (client copy differs in comments only) |
| Client | Overview tab renders only the PR description | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:11-21`, `page.tsx:139` |
| Client i18n | `messages/en/brief.json` exists (`block.intent: "Intent"`, plus L04/L05 keys) but is **not** in `USED_NAMESPACES` | `client/src/app/layout.tsx:21-31` |

### What is actually missing

- An extraction pipeline: gathering signals, resolving references, the model
  call, the confidence rules.
- Link resolution, and a policy for which link kinds are followed.
- Columns for confidence, sources, model, cost and the cache key. No route.
  Nothing calls the repository.
- An `intent` slot in the reviewer prompt and trace.
- Intent UI of any kind. The `brief` namespace is not wired in.
- A cheap default for `review_intent`, and one registry instead of two.
- Containment in `readFile`. Today a PR body is not a path source; after this
  spec it will be.

---

## 2. Decisions

### D1 — Pure pieces in reviewer-core, I/O in a new server module
reviewer-core gets `src/intent/`: reference parsing, the confidence rule, and
`deriveIntent()`, which takes **already-resolved** inputs and an injected
`LLMProvider` and returns a validated draft with tokens and cost. It also gets
the prompt `intent` slot. The server gets `modules/intent/`, which does
everything with I/O: reading the PR rows, resolving references over GitHub and
the clone, the cache, persistence and routes.
**Why:** this is reviewer-core's purity rule (reviewer-core `CLAUDE.md`)
applied as written, and the L06 CI runner shares the engine and will want the
same derivation. `reviewPullRequest` still does no intent work, as
`run.ts:20-28` says. `deriveIntent` is a separate export.
**Rejected:** putting everything in the server (the prompt slot has to live in
reviewer-core anyway, and CI would duplicate the logic); putting resolution in
reviewer-core (it would need GitHub and the filesystem).

### D2 — When intent is derived: at review step 0, and on demand. Never on import, never on a GET
1. **Review run, step 0:** after the diff loads, `ensureIntent()` reuses the
   cached row if it is fresh and derives a new one otherwise. This is shared
   pre-work: one derivation for N agents.
2. **Explicit button:** "Derive intent" (empty state) or "Re-derive" (with
   `force: true`) on the Intent card.

**Freshness key:** `head_sha` + `pr_text_hash` (sha256 of `title + "\n" + body`).
A row is `stale` when either differs from the PR row. Each resolved source
stores its own content hash for audit. Changes to linked documents are **not**
part of the freshness check. The force button covers them.
**Rejected:** deriving on import/sync (`GET /repos/:id/pulls` upserts 50 PRs,
which would mean 50 paid calls per list load); deriving lazily on GET (a
refetch would spend credits); putting linked-resource hashes in the key (every
freshness check would then need GitHub and clone I/O, including on every
run).

### D3 — Data model: widen `pr_intent`, one row per PR
New columns (all additive, generated via `pnpm db:generate`):
`confidence text enum('high','medium','low') not null default 'low'`,
`signals jsonb string[] not null default []`,
`sources jsonb not null default []`, `model text`, `cost_usd double precision`
(nullable = unpriced), `tokens_in int not null default 0`,
`tokens_out int not null default 0`, `head_sha text`, `pr_text_hash text`,
`derived_at timestamptz not null default now()`.
The upsert overwrites every column and sets `derived_at = now()`. **A failed
derivation writes nothing**, so the previous row survives.
**Why:** the table, its PK and its cascade already exist. `sources` is always
read with the row and never queried by itself, so jsonb is right
(`postgresql-table-design`). **Rejected:** a history table (nothing in the
design reads past intents); persisting `linked_issue` on `pull_requests` (the
resolver fetches issues itself, D5).

### D4 — Contracts (both copies)
`brief.ts`: add `IntentConfidence = z.enum(['high','medium','low'])`,
`IntentSignal = z.enum(['title','description','linked_docs','commits','branch','file_paths','diff'])`,
`IntentSourceKind = z.enum(['issue','pull','repo_file','external'])`,
`IntentSkipReason = z.enum(['external_not_fetched','cross_repo','outside_repo','unsupported_type','not_found','no_clone','github_unavailable','fetch_failed','limit_reached'])`,
and `IntentSource = { kind, ref: string, status: z.enum(['used','skipped']), reason: IntentSkipReason.nullable(), title: string.nullable(), chars: int.nullable(), truncated: boolean }`.
`Intent` itself stays unchanged (the design fixture and `PrBrief` use it).
`review-api.ts`: `PrIntentRecord` becomes `Intent.extend({ pr_id, confidence, signals, sources, model: nullable, cost_usd: nullable, tokens_in, tokens_out, head_sha: nullable, derived_at, stale: boolean })`,
plus `PrIntentResponse = { intent: PrIntentRecord.nullable() }` and
`DeriveIntentRequest = { force: boolean.default(false) }`.
`trace.ts`: `PromptAssembly.intent: z.string().nullish()`. Existing traces stay
parseable.
The classifier's output schema, `IntentDraft`, is **engine-internal**
(reviewer-core, not shared): `intent` ≤ 300 chars, `in_scope`/`out_of_scope`
≤ 8 items of ≤ 160 chars each. It has **no confidence field**.

### D5 — Supported references, and what is not followed
Parsed from the description (and, one hop only, from the bodies of issues it
links to), deduplicated, in order of appearance, **at most 5 resolved**. The
rest are recorded as `limit_reached`.

| Pattern | Kind | Resolution |
|---|---|---|
| `#N`, `closes/fixes/resolves #N`, `owner/repo#N` (same repo), `github.com/<o>/<r>/issues/N` | issue | `GitHubClient.getIssue`. The PR's own number is excluded |
| `github.com/<o>/<r>/pull/N` | pull | `getIssue` as well: GitHub's issues endpoint serves PRs (verify during implementation) |
| `github.com/<o>/<r>/blob/<ref>/<path>` (same repo) | repo_file | same as a repo path. The `ref` is ignored, and `ref` records the URL |
| markdown link or bare token that is a relative path ending `.md .mdx .markdown .txt .rst .adoc` | repo_file | see D6 |
| any other `http(s)` URL | external | **not fetched** → `external_not_fetched` |
| different owner/repo | — | `cross_repo` |
| other schemes (`file:`, `ftp:`, …) | — | `unsupported_type` |

**External URLs are not fetched. Decided.** The API has no auth
(server INSIGHTS "binds to loopback"), and the URL is chosen by whoever opened
the PR. A server-side GET would be SSRF against `localhost` (the API itself, dev
tools), the LAN and cloud metadata, and the body would flow into a paid prompt
and into the UI. A sound implementation needs DNS pinning plus IP-range
blocking plus redirect control. That work belongs in its own spec with a
security review. **Rejected:** a generic fetch with an IP blocklist (broken by
DNS rebinding and redirects); a domain allowlist (the likely hosts, Notion and
Google Docs, need auth anyway). External links still show in the sources list.
**Cross-repo refs are skipped** because the PAT can read private repos the PR
author cannot, and following an author-supplied link would copy that content
into this PR's prompt.

### D6 — Repo files: the PR's copy if the PR adds the file, else the clone. Contained twice
1. Lexical guard in a pure helper: POSIX-normalize, and reject absolute paths,
   `~`, backslashes and any `..` escape (`outside_repo`). Reject
   non-allowlisted extensions (`unsupported_type`). This excludes `.env`,
   `secrets.json` and the like.
2. If `pr_files` has the path and its patch is a pure addition
   (`@@ -0,0 +1,N @@`), rebuild the content from the `+` lines. A spec added in
   the same PR is the common case.
3. Otherwise, if `repos.clone_path` is null → `no_clone`. If not, call
   `git.readFile`, which reads the default-branch working copy.
4. **`SimpleGitClient.readFile` itself** resolves the path and its `realpath`,
   and throws unless the result is inside the clone's realpath. That also
   blocks a committed symlink that points at `~/.devdigest/secrets.json`. This
   protects every caller, conventions included.

### D7 — Confidence is computed by code, never reported by the model
Define `documentedChars` = `meaningful(body)` + the chars of every **used**
issue/pull body and repo file. `meaningful()` removes HTML comments, lines that
are only a markdown heading, lines that are only a URL, and collapses
whitespace. Checkbox lines are kept, because they often carry scope.
- **high**: `documentedChars ≥ 300`, **or** any used linked doc ≥ 200 chars.
- **medium**: `80 ≤ documentedChars < 300`.
- **low**: `< 80`. The intent is "inferred" from title, commits, branch, paths
  and the diff.

`signals` records which inputs had content. Thresholds live in
`reviewer-core/src/intent/constants.ts`.
**Why:** this is the same rule the engine applies to scores ("never trust a
score the model returned"). An enum with a documented rule is testable, and a
0–1 number would be false precision. **Rejected:** model self-report; a
numeric score.

### D8 — How intent reaches the reviewer
`PromptParts.intent?: { intent, in_scope, out_of_scope, confidence }` renders
**immediately after `## PR description`** (before skills) as:

```
## PR intent (confidence: <level>)
<trusted guidance for that level>
<untrusted source="pr-intent"> Intent: … / In scope: - … / Out of scope: - … </untrusted>
```

The intent content is wrapped because it was derived from untrusted text. The
guidance is a trusted constant:
- **high:** check the diff against the scope. An in-scope item that is
  implemented wrongly or incompletely → a finding at the implementing line,
  with the item quoted in the rationale (the `f4` pattern). A change that falls
  under out-of-scope, or is unrelated to the intent → **SUGGESTION** at that
  change, unless the change is defective in itself. An in-scope item with no
  code in the diff → mention it in the **summary**, not as a finding (the
  grounding gate would drop an invented line).
- **medium:** the same rules, but scope findings stay SUGGESTION and are
  phrased as questions.
- **low:** "Inferred from indirect signals, not stated by the author. Use it
  for orientation only. Do not raise a finding whose only basis is a mismatch
  with it. A likely scope mismatch may be noted in the summary."

With no intent the section is omitted, and the prompt is **byte-identical** to
today's (the optional-slot invariant in reviewer-core `CLAUDE.md`). No new
`FindingCategory` is added. **Rejected:** a `scope` category (an enum change in
both copies plus every UI colour map, which the design does not draw).

### D9 — A failure never blocks a review
In the executor, `ensureIntent` runs inside `runLog.step('Deriving PR intent')`
wrapped in try/catch. On any error (missing key, timeout, invalid JSON after
repair, GitHub down) it writes the Live Log line
`intent: unavailable — <msg>` and the agents run without the slot. Per-reference
failures never fail the derivation. They become `skipped` sources.

| Failure | Behaviour |
|---|---|
| provider key missing (`ConfigError`) / model error / timeout | route: `502 intent_failed` (message included); run: continues, Live Log line; previous row kept |
| invalid JSON | `completeStructured` repair with `maxRetries: 1`, then as above |
| reference unreachable / 404 / GitHub unavailable | source `skipped` with `fetch_failed` / `not_found` / `github_unavailable` |
| each reference | wrapped in `withTimeout(…, 10_000)` (`platform/resilience.ts`); resolved with `Promise.allSettled` |
| oversized inputs | truncated (D10), with `truncated: true` on the source |

### D10 — Truncation budget (constants in reviewer-core)
Body 6 000 chars. Each linked doc 6 000, all docs together 16 000. Commits: the
first 30 messages, 300 chars each. Paths: the first 100, with +/− counts. Diff
excerpt 6 000 chars. Classifier call: `timeoutMs 60_000`, `maxRetries 1`.
Every input goes through `wrapUntrusted` with its own label (`pr-description`,
`issue:#12`, `file:docs/plan.md`, `commits`, `diff-excerpt`). The classifier's
system prompt says that text inside those blocks is data only.

### D11 — UI: the Intent block ships now, inside a PR Brief section with no other cards
The Overview gets `SectionLabel icon="FileText"` "PR Brief", then one full-width
card containing `SectionLabel icon="Target"` "Intent" and the design's
`IntentBlock`, then the existing Description. The verdict banner, risk areas,
blast radius and history are **not** built. L04/L05 add them and turn this into
the design's two-column grid.
**Additions, not in the design** (built from existing tokens and kit):
- a **confidence badge** after the quote: high → `var(--ok)`/`var(--ok-bg)`
  "High confidence · documented", medium → `var(--warn)`/`var(--warn-bg)`,
  low → `var(--text-muted)` outline "Low confidence · inferred". A low
  confidence also shows one muted line naming the signals it was inferred from;
- a **SOURCES** list, using the same 11px/700 header style: one row per source
  with an icon, the ref in mono, and for a skipped source the muted, localized
  reason;
- a footer in muted 11.5px: model, cost (`CostBadge` if the kit exports it,
  verify during implementation), "Re-derive" ghost button, and a stale note
  when `stale`;
- an empty state ("No intent yet" + primary "Derive intent"); a skeleton while
  loading. An empty out-of-scope list shows "Nothing stated".

### D12 — Settings: reuse `review_intent`, give it a cheap default, keep one registry
- Default: `openrouter` / `anthropic/claude-haiku-4.5` in **both** shared
  copies. The reasoning is L02 D11's: it runs on a key the install already
  needs. It must **not** be `deepseek/deepseek-v4-flash` (reviewer-core
  INSIGHTS: it hangs on long prompts). The service uses
  `resolveFeatureModel(container, ws, 'review_intent')`.
- The client mirror `lib/feature-models.ts` becomes a re-export of
  `FEATURE_MODELS` from `@devdigest/shared`. That fixes the `conventions`
  drift and leaves one registry. Its stale comment goes too.
- **Validation:** keep the current behaviour (`FeatureModelChoice`: a provider
  enum and a non-empty model). The picker only offers models from the live
  OpenRouter list. A model that is invalid anyway fails at use time with
  `502 intent_failed`, and the Intent card and Live Log show the provider's
  message. **Rejected:** checking membership on `PUT /settings` (it would need
  a network call or a warm `PriceBook` on a settings write, and it could not
  validate offline).

### D13 — Cost is recorded on the intent row, not on agent runs
The classifier's `costUsd` (with sticky null, the same provider path as
reviews, `cost-accounting.md`), tokens and model go on `pr_intent`. The run's
Live Log line includes the cost. It is **not** added to any
`agent_runs.cost_usd`: one derivation serves N agents, and splitting it would
be arbitrary. So the PR list's `cost_usd` excludes intent cost. See Q3.

---

## 3. Contracts — both `vendor/shared` copies

Edit `client/src/vendor/shared/` **and** `server/src/vendor/shared/` identically:
- `contracts/brief.ts`: the D4 enums and `IntentSource`.
- `contracts/review-api.ts`: the widened `PrIntentRecord`, `PrIntentResponse`,
  `DeriveIntentRequest`.
- `contracts/trace.ts`: `PromptAssembly.intent`.
- `contracts/platform.ts`: the `review_intent` default (D12), plus a description
  that mentions the cheap model.

Afterwards `diff -r client/src/vendor/shared server/src/vendor/shared` must list
only the five pre-existing drifted files, and `trace.ts` must still differ in
comments only.

## 4. reviewer-core

- `src/intent/constants.ts`: D7 thresholds, D10 budgets, the doc extension
  allowlist, `MAX_REFERENCES = 5`.
- `src/intent/references.ts`: `extractReferences(text, { owner, name, prNumber })`
  → an ordered list of `{ kind, ref, target }` or pre-skipped entries (D5), plus
  `normalizeRepoPath(p)` (the lexical guard in D6). Pure.
- `src/intent/confidence.ts`: `meaningfulText(body)` and
  `computeConfidence({ body, usedDocs })` → `{ confidence, documentedChars }`.
- `src/intent/derive.ts`: `deriveIntent({ llm, model, title, body, branch, commits, files, diffExcerpt, docs, sessionId? })`
  → `{ draft: Intent, confidence, signals, tokensIn, tokensOut, costUsd, raw }`.
  It truncates (D10), wraps every input, makes one `completeStructured` call
  with `schemaName: 'IntentDraft'`, and computes confidence and signals in code.
  Its system prompt is a TS constant in this file (the package cannot read
  files).
- `src/prompt.ts`: the `intent` slot and its rendering (D8); guidance constants
  per level; `assembly.intent`.
- `src/review/run.ts`: `ReviewInput.intent?` passed through to `promptParts`.
- `src/index.ts`: export `deriveIntent`, `extractReferences`,
  `normalizeRepoPath`, `computeConfidence` and the types.

## 5. Server

**5.1 Schema.** `db/schema/reviews.ts` `prIntent` gets the D3 columns, then
`pnpm db:generate`. Never write the migration by hand. Add an `IntentRow` to
`db/rows.ts` per its convention.

**5.2 Module `modules/intent/`** (`onion-architecture` file roles):
- `repository.ts`: `get(prId)` and `upsert(prId, row)`. **Move** the unused
  `upsertIntent`/`getIntent` out of `reviews/repository/pull.repo.ts` and
  `reviews/repository.ts` rather than keeping two copies.
- `helpers.ts` (pure): `prTextHash`, `isStale(row, pull)`,
  `contentFromAddedPatch(patch)`, `toRecord(row, pull)`.
- `resolver.ts` (or inside `service.ts`): D5/D6 resolution through
  `container.github()` / `container.git`, one hop into issue bodies, a 10 s
  timeout per reference.
- `service.ts`: `get(ws, prId)`; `derive(ws, prId, { force })`;
  `ensure(ws, pull, repo, diff, runLog?)`, which returns the cached row when
  fresh, otherwise gathers inputs, resolves them, calls `deriveIntent` with the
  `review_intent` model and upserts.
- `routes.ts`: `GET /pulls/:id/intent` → `PrIntentResponse` (it never calls the
  LLM); `POST /pulls/:id/intent` body `DeriveIntentRequest` → `PrIntentRecord`.
  Response schemas are `ApiErrors`, `NotFound` and `502: ApiErrorBody`. Raise
  the route's timeout to cover a 60 s model call. Register it in
  `modules/index.ts`.
- Container: `get intent()` returns the service, following the `repoIntel`
  facade precedent, so `reviews` never imports a sibling module. Check with
  `make lint-arch`.

**5.3 Executor** (`reviews/run-executor.ts`): after the diff loads
(`:96-106`), call `ensure` inside the D9 try/catch. Pass `intent` into
`reviewPullRequest` only when present. The Live Log line is either
`intent: reused (confidence high)` or
`intent: derived with <model> (<n> sources, $<cost>)`.

**5.4 Git adapter**: containment in `SimpleGitClient.readFile` (D6.4).

**5.5 Mocks** (`adapters/mocks.ts`): a canned `IntentDraft` for
`MockLLMProvider` keyed by schema name (verify the `structuredBySchema`
mechanism during implementation); `getIssue` already exists (`:240`).

**5.6 Docs:** add one line to `server/.context/docs/pr-list-read-model.md` saying
that `cost_usd` excludes intent cost (D13).

## 6. Client

- `lib/feature-models.ts` → a re-export from `@devdigest/shared` (D12).
  Afterwards `SettingsModels` is unchanged.
- `lib/hooks/intent.ts`: `usePrIntent(prId)` (key `["pr-intent", prId]`,
  parsed with `PrIntentResponse` in `apiFetch`) and `useDeriveIntent(prId)`
  (POST; `setQueryData` on success; `notify` on error, following the pattern
  in `hooks/reviews.ts`). Export both from `lib/hooks/index.ts`.
- `_components/IntentCard/` under the PR detail route: `IntentCard.tsx`,
  `helpers.ts` (confidence → tokens and label key, source → icon),
  `constants.ts`, `styles.ts`, `index.ts`, `IntentCard.test.tsx`. It renders
  the design's `IntentBlock` plus the D11 additions and states. Follow
  `frontend-architecture` for placement.
- `OverviewTab.tsx` takes `prId` and renders the PR Brief section and
  `IntentCard` above the Description. `page.tsx:139` passes `prId`. The
  page's `onRunDone` also invalidates `["pr-intent", prId]`.
- i18n: **merge** an `intent` block into `messages/en/brief.json` (title,
  inScope, outOfScope, nothingStated, confidence.{high,medium,low},
  inferredFrom, sources, skip.<each IntentSkipReason>, derive, rederive,
  deriving, stale, empty). Keep `block`, `why` and every other existing key,
  and grep for `"brief"` usage before editing (client INSIGHTS 2026-09-21). Add
  `"brief"` to `USED_NAMESPACES` in `app/layout.tsx`.

## 7. Seeds

`server/src/db/seed-intent.ts`, called from `seed.ts` alongside the other
per-feature seeds, is insert-only when no row exists:
- demo PR **#482** (`acme/payments-api`): the design's `INTENT` text,
  `confidence 'high'`, `signals ['title','description']`, one skipped external
  source (so the sources list is visible), `head_sha` = the seeded PR's head
  (so it is not stale), `model` = the D12 slug, a small `cost_usd`;
- one other seeded PR with a thin body gets a `low` row with
  `signals ['title','commits','branch','file_paths']` (pick it during
  implementation).

There are no pre-existing seeded `pr_intent` rows to backfill (confirm during
implementation). If there are, follow the backfill rule in server INSIGHTS
2026-09-21. `server/test/seed-fixtures.test.ts` must stay green.

## 8. Tests

| ID | Suite | Covers |
|---|---|---|
| T1 | reviewer-core `src/intent/references.test.ts` | `#N`/closes/same-repo issue, pull and blob URLs; cross-repo → `cross_repo`; relative doc paths; `../x.md` → `outside_repo`; `.env` → `unsupported_type`; external → `external_not_fetched`; dedupe; own PR number excluded; cap 5 |
| T2 | reviewer-core `src/intent/confidence.test.ts` | boundaries 79/80/299/300; a 200-char used doc → high; a template-only body (headings and comments) → low |
| T3 | reviewer-core `src/intent/derive.test.ts` | stubbed LLM: each input is wrapped with its label; truncation; a model-supplied `confidence` is ignored; tokens/cost passed through, null cost stays null |
| T4 | reviewer-core prompt test (existing file, or `src/prompt.test.ts`) | no intent → byte-identical prompt; high → scope guidance and wrapped block placed after PR description, before skills; low → hedged guidance; `assembly.intent` set |
| T5 | server unit `modules/intent/helpers.test.ts` | `isStale` on head/text change; `contentFromAddedPatch`; `prTextHash` stable |
| T6 | server unit `adapters/git/simple-git.test.ts` | `readFile` rejects `../` and a symlink out of a temp clone; reads a normal file |
| T7 | server integration `test/intent.it.test.ts` | mocks: POST derives and persists confidence, sources, model, cost; GET returns it with `stale:false`, then `stale:true` after `head_sha` changes; a failing LLM → 502 and the previous row kept; a review run stores `prompt_assembly.intent` in the trace; a run with a failing classifier ends `done` with no intent section |
| T8 | server integration `test/settings-models.it.test.ts` (extend) | the `review_intent` default is the D12 slug; an override is honoured |
| T9 | client `IntentCard.test.tsx` | ready (quote, both lists, badge, sources incl. a skipped reason); low hint; stale note; empty state → POST; nothing-stated |
| T10 | e2e `e2e/specs/10-pr-intent.flow.json` | seeded #482 Overview shows the seeded intent text, "IN SCOPE" and the high-confidence label. `--text` locators only, no model |

## 9. Out of scope

- **Smart Diff** (the other L03 feature) and its `SmartDiff` contract.
- PR Brief verdict banner, risk areas, blast radius and history (L04/L05); the
  N8 Conformance "Scope creep" column.
- Fetching external URLs (D5); cross-repo references.
- Deriving on import or on page view (D2).
- A `scope` `FindingCategory` (D8).
- Persisting `linked_issue` on `pull_requests`, or fixing the offline
  `GET /pulls/:id` drop.
- CI-runner wiring of `deriveIntent` (L06).
- Adding intent cost to the PR list total (Q3).

## 10. Acceptance

- **A1** `diff -r client/src/vendor/shared server/src/vendor/shared` lists only
  the five pre-existing drifted files. `brief.ts`, `review-api.ts` and
  `platform.ts` are identical across the copies.
- **A2** `GET /pulls/:id/intent` on a PR with no row returns
  `{ "intent": null }` and makes no LLM call (the mock records zero calls).
- **A3** `POST /pulls/:id/intent` persists a row with `confidence`, `signals`,
  `sources`, `model` = the resolved `review_intent` model, `cost_usd`,
  `head_sha`. A repeated GET returns it with `stale: false`.
- **A4** A body under 80 meaningful chars yields `confidence: "low"`. A body
  over 300 yields `"high"`, whatever the model outputs.
- **A5** A description linking `https://example.com/spec` and
  `../../secrets.json` produces two `skipped` sources
  (`external_not_fetched`, `outside_repo`). No outbound request goes to
  `example.com`.
- **A6** A description linking an added `docs/plan.md` in the same PR lists
  that file as `used`, and its text reaches the classifier prompt inside
  `<untrusted source="file:docs/plan.md">`.
- **A7** Once a run has a derived intent, its trace `prompt_assembly.intent` is
  non-null, the user prompt contains `## PR intent (confidence: …)` after
  `## PR description`, and the Live Log has an `intent:` line.
- **A8** With the classifier failing, the review run still completes (`done`)
  and its prompt contains no `## PR intent`.
- **A9** With no intent, `assemblePrompt` output is byte-identical to the
  pre-change output (T4).
- **A10** Settings → Feature Models shows "PR Review · Intent" defaulting to
  `anthropic/claude-haiku-4.5`. Picking another model makes the next derive
  record that model.
- **A11** Seeded #482 Overview shows "PR Brief", the quoted intent, IN SCOPE /
  OUT OF SCOPE, a confidence badge, a sources list and a Re-derive button. A
  low-confidence PR shows "Low confidence · inferred" plus the signals line.
- **A12** `SimpleGitClient.readFile` throws for a path that resolves outside the
  clone (T6).
- **A13** `make test`, `make test-it`, `make typecheck`, `make lint-arch` and
  `make e2e` pass, and the `diff -r` from A1 holds.

## 11. Open questions

None blocking.
- **Q1** [non-blocking] Should the Overview auto-derive on first view when no
  intent exists? Default: no, use the explicit button plus review step 0 (D2).
  The alternative spends credits just from browsing.
- **Q2** [non-blocking] Should external plan links become fetchable later,
  through an opt-in allowlist with DNS pinning? Default: listed, never fetched
  (D5).
- **Q3** [non-blocking] Should the PR list `cost_usd` include intent cost?
  Default: excluded; the cost shows on the Intent card (D13).
- **Q4** [non-blocking] Should same-owner cross-repo issue links be followed
  (org-wide specs)? Default: skipped as `cross_repo`.
