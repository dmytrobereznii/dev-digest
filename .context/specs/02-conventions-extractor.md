# 02 — Conventions extractor

**Lesson:** L02 (`Conventions extractor`), the second half of the lesson whose
first half built the Skills Lab. That spec has landed and been deleted per
`CLAUDE.md` (its text is in `ce17ea0`), so what this one inherits is live code,
not prose — read it where it now lives:

| Inherited, not re-decided | Where it lives |
|---|---|
| `CodeEditor` + `estimateTokens` — shared kit, not a skills component | `client/src/vendor/ui/kit/CodeEditor.tsx` |
| The `## <name>` skill block and its `<untrusted>` wrapper | `reviewer-core/src/prompt.ts` |
| Provenance: `source` is never nameable by the client | `server/src/modules/skills/{routes,service}.ts` |

This spec builds the surface that *writes into* that Skills Lab.

**Goal:** scan a cloned repo for its house rules, show each one as a candidate
backed by evidence the user can see, let the user accept or reject each, and
merge the accepted set into **one** editable `convention` skill in the Skills
Lab.

**The design is the source of truth.** Where this spec and the artboards
disagree, the artboards win; where the artboards are silent (provenance, the
verification gate, tenancy), the decisions below fill the gap and say so.

## Design reference

Bundle: `designs_with_skills.html` (extracted 2026-09-20).

| Surface | What it contributes |
|---|---|
| `src/screen_conv_conf.jsx` → `ScreenConventions` | the page: header, Re-scan, the accept-all toolbar, the card list, the empty state |
| `src/screen_conv_conf.jsx` → `ConventionCard` | one candidate: rule, evidence block, confidence bar, Accept / Reject |
| `src/screen_conv_conf.jsx` → `CreateSkillModal` + `conventionsToDraft` | the merge: **one** draft skill from the accepted set, fully editable |
| `src/chrome.jsx` → `NAV` | `{ key: "conventions", label: "Conventions", icon: "ListChecks" }`, in **SKILLS LAB**, **after** `agents` |
| `src/data.jsx` → `CONVENTIONS` | the candidate fixture — and the exact field names the DB already uses |

Canvas artboards (`canvas/canvas.jsx` → section `repo`): `conventions`,
`conv-create`, `e-conv` (empty). `ScreenConformance` shares the file and is
**N8, not this lesson** — see §7.

`screen_conv_conf.jsx` is also the proof that `CodeEditor` is shared kit: this
modal calls `window.CodeEditor`, which `screen_skills.jsx` defines — which is
why it already sits in `vendor/ui/kit/`, not in a skills folder.

---

## 1. What the starter already ships

More than the Skills Lab inherited. Almost nothing here is new construction.

| Layer | Already there | Where |
|---|---|---|
| DB | the **`conventions` table**, in migration `0000_init.sql` — `rule`, `evidence_path`, `evidence_snippet`, `confidence`, `accepted`, workspace- and repo-scoped with cascade | `server/src/db/schema/knowledge.ts:31` |
| Contracts | **`ConventionCandidate`** — `{ id, rule, evidence_path, evidence_snippet, confidence, accepted }`, **identical in both vendored copies** | `*/src/vendor/shared/contracts/knowledge.ts` |
| Contracts | `SkillSource` already has `'extracted'`; `SkillType` already has `'convention'` | same file |
| Feature model | **`'conventions'` is already a `FeatureModelId`** with a registry default, and `resolveFeatureModel()` reads the workspace override | `contracts/platform.ts:15`, `modules/settings/feature-models.ts:51` |
| Sampling | **`repoIntel.getConventionSamples(repoId, n)`** — top-N ranked paths, minus tests/configs/migrations | `modules/repo-intel/service.ts:630` |
| File reads | `GitClient.readFile(repo, path)` against the clone — the gate's whole mechanism | `adapters/git/simple-git.ts:129` |
| LLM | `container.llm(providerId)` → `completeStructured({ model, schema, schemaName, messages })`, with repair + retry | `platform/container.ts:169` |
| Prompt files | `loadPromptTemplate` / `renderPrompt` over `src/prompts/*.md` | `platform/prompts.ts` |
| Client — routing | `activeKeyFor` **already maps** `pathname.includes("/conventions")` → `"conventions"` | `components/app-shell/helpers.ts:33` |
| Client — i18n | `messages/en/conventions.json` exists, with the page, empty state and card copy | `client/messages/en/conventions.json` |
| Client — kit | `ProgressBar`, `MonoLink`, `EmptyState`, `Toggle`, `Modal`, `FormField`, `TextInput`, `SelectInput`, `Button`, `Badge` — and `CodeEditor` + `estimateTokens`, already in the kit. Every icon the artboard uses (`ListChecks` `RefreshCw` `Copy` `Wrench` `Plus` `Check` `X` `Sparkles` `GitCommit`) is in the registry | `client/src/vendor/ui/` |
| Client — repo scope | `useActiveRepo()` and `resolveHref(href, repoId)` already resolve `:repoId` in a nav href | `lib/repo-context`, `vendor/ui/nav.ts` |

**Consequence: no kit work at all, and one contract field.** The only
`vendor/shared` edit is §3.1's `status`, which must land in **both** copies.

### What is actually missing

- `server/src/modules/conventions/` — does not exist.
- The `conventions` table has no `status` (reject has nowhere to go), no
  `created_at`, and nothing records *that a scan happened* — the design's
  subtitle needs both.
- No prompt template, no extraction pipeline, no evidence gate.
- No way to create a skill with `source: 'extracted'`: `POST /skills` maps the
  provenance checkbox to `manual` / `imported_url` and accepts no third value,
  by design — a boolean can only pick between two server-defined outcomes.
- Client: no `/repos/:repoId/conventions` route, no `Conventions` nav item, no
  hooks.
- No seeds, no e2e flow.

---

## 2. Decisions

### D1 — One merged skill, because the design merges

`conventionsToDraft(acceptedList)` builds **one** draft from the whole accepted
list: `## <rule-slug>` per rule, each with its evidence fence, under a single
`# <repo>-conventions` heading. Its `single` branch changes only the *naming* —
one accepted rule names the skill after that rule instead of after the repo —
it does not switch to one-skill-per-rule. The modal's banner says it out loud:
_"Merged from N accepted conventions"_.

**This reverses an earlier answer in the session** (one skill per accepted
convention). That shape has no home in the bundle: the modal drafts one skill,
the "Create skill" button is a single header-level action, and nothing draws a
per-card create button or a stepper. Designs are the source of truth, so the
merge stands. One skill also means one prompt block and one link per agent,
which is what makes the lesson's control experiment legible.

The older `conventions.json` key `card.acceptAsSkill` ("Accept as Skill") is
from a **previous** iteration where each card created its own skill. Leave the
key in the file — unused, the way `skills.json` still carries its import copy — and
render `card.accept` / `card.accepted` instead.

### D2 — Accept is a toggle; Reject is terminal and persists

The card's right column is two controls, not three states of one:

| Control | Artboard | Effect |
|---|---|---|
| **Accept** | `secondary` + `Plus` → `primary` + `Check` ("Accepted"), and a 3px `var(--ok)` left border on the card | toggles `status` between `pending` and `accepted` |
| **Reject** | `ghost` + `X`, always | sets `status: 'rejected'` — the card leaves the list |

The artboard draws no rejected card, and `ScreenConventions` renders every row
of `CONVENTIONS` unfiltered. Both are true at once only if a rejected candidate
is no longer in the list the page receives: `GET` returns `pending` and
`accepted` only. That is a derivation by omission, and it is the reason reject
is not a second toggle.

`status` is a new column (§3.1). The existing `accepted` boolean stays in the
table and in `ConventionCandidate` — it is what the card's border and button
read — and is kept in lockstep with `status` by the repository, never written
independently.

### D3 — Re-scan keeps the user's decisions

`Re-scan` deletes this repo's **`pending`** rows and re-extracts. `accepted`
rows survive because they may already be in a saved skill; `rejected` rows
survive so the same rule is not proposed again — a candidate whose normalised
rule text matches a surviving `accepted` or `rejected` row is dropped before
insert (§3.4).

That is the whole value of persisting a rejection: a scan the user has already
triaged does not hand back the same three rules it handed back last time.

### D4 — A scan is a row, because "last scan" outlives its candidates

The subtitle is _"Detected from **84 sample files** · last scan **1h ago**"_.
Neither number is derivable from `conventions`: it has no timestamp, and the
sample count is a property of the scan, not of a rule. A count stamped onto
each candidate row would also vanish entirely in the case that matters most —
a scan where the gate (§3.4) discards everything, which must still say _"last
scan 2m ago · 0 candidates"_ rather than falling back to the empty state and
implying the repo was never scanned.

So: a **`convention_scans`** table — `{ id, workspace_id, repo_id,
sample_count, model, created_at }` — and `conventions.scan_id` pointing at it.
`GET /repos/:id/conventions` returns `{ scan, candidates }`; `scan` is `null`
before the first run and drives the empty state.

### D5 — Selection is code, extraction is one model call

Per the brief, and it is also what keeps the gate meaningful:

1. **Config files** — a fixed list (`package.json`, `tsconfig.json`,
   `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `prettier.config.*`,
   `.editorconfig`), each read through `GitClient.readFile` and skipped when
   absent. No model, no guessing.
2. **Top 12 source files** — `repoIntel.getConventionSamples(repoId, 12)`,
   which already drops tests, configs and migrations.
3. **One `completeStructured` call** over those files, `schemaName:
   'ConventionExtraction'`.

`adapters/mocks.ts:49` describes a **two**-step dialogue
(`'ConventionFileSelection'` then `'ConventionExtraction'`) — that comment
documents an older design in which the model also picked the files. We do not
make that call. Fix the comment to name the one schema we send rather than
leaving a doc comment that sends the next reader looking for a second call
site. `structuredBySchema` keeps working with one entry.

### D6 — The snippet is the evidence; the line number is a hint

The gate is pure code and runs on every candidate before it is persisted.
A candidate survives iff:

1. `evidence_path` parses as `path` or `path:start-end`, **and** `path` is one
   of the files we actually sent. A citation of a file the model never saw is
   invention by construction, and this check costs a `Set.has`.
2. `readFile(repo, path)` succeeds.
3. The snippet, **whitespace-normalised, non-empty lines only, in order**,
   occurs in that file.

If (3) matches at a different location than the model claimed, the range is
**repaired** from where the text actually is, not discarded. Models quote
accurately and count lines badly; discarding on the line number would throw
away good evidence for the one part of the answer we can recompute ourselves.
If (3) does not match at all, the candidate is dropped and counted in the log —
this is the same trade the `reviewer-core` grounding gate makes on findings,
and for the same reason.

Confidence is clamped to `[0, 1]`; a missing one defaults to `0.5`.

### D7 — The extract route is synchronous

`POST /repos/:id/conventions/extract` runs select → call → gate → persist
inline and responds with the scan and its candidates. The design shows no job,
no progress bar and no partial state — the button goes to
`conventions.json`'s `page.scanning` ("Scanning…") and comes back with a list.
`repo-intel`'s 202 + poll shape exists because indexing is minutes long and
must survive a reload; one model call over 13 files is neither.

The route needs a raised `requestTimeout`; note it rather than discovering it
at 30s.

### D8 — The skill is created server-side, with `source: 'extracted'`

`POST /skills` cannot be reused: `CreateSkillBody`
(`server/src/modules/skills/routes.ts`) makes `source` unnameable by the client, and the modal's **Enabled** toggle has no input there either. So the
merge gets its own route, `POST /repos/:id/conventions/skill`, which takes the
edited draft (`name`, `description`, `type`, `enabled`, `body`) plus the
`convention_ids` it was merged from, and writes the skill with `source:
'extracted'` — a value the client still never sends.

The skill lands as **v1** with one `skill_versions` row, exactly like any other
(the footer says so: _"Saved as v1 · added to Skills Lab"_), and the card in
the Skills Lab renders `Wrench` / "Extracted" from the source map in
`client/src/app/skills/_components/SkillCard/constants.ts`.

### D9 — An extracted skill is enabled and trusted

The draft is `enabled: true` in the design and the modal's toggle is on, so
enabled is not in question. Trust is: `run-executor.ts:198` currently reads
`trusted: l.skill.source === 'manual'`, which would wrap an extracted body in
`<untrusted>`. It widens to `source === 'manual' || source === 'extracted'`.

**Stated once, then built as decided:** an extracted body embeds verbatim repo
text — comments and string literals inside the evidence fences — that nobody
read line by line, which is the surface `<untrusted>` exists for. The counter
is that every rule passed a human accept click and the body was editable in a
full-screen editor before it was saved, which is more vetting than any other
trusted path in the product gets. The decision is trusted; the concern is
recorded here so a future reviewer sees it was weighed, not missed.

Knock-on: the `trusted` predicate is now a two-value allowlist and will grow.
Put it in `modules/reviews/helpers.ts` as `isTrustedSource(source)` with the
reasoning above, so the next source added has one place to declare itself.

### D10 — The page is repo-scoped; the nav item is not

The heading is _"Conventions in `payments-api`"_ and every row is
`repo_id`-scoped, so the route is **`/repos/:repoId/conventions`**. The nav
entry uses the `:repoId` template that `resolveHref` already fills from the
active repo, exactly as `pulls` does — the sidebar item is global, the page it
opens is not.

Nav order is the design's: `skills`, `agents`, **`conventions`** — after
agents, not before. `nav.ts`'s comment already promises it ("Later lessons add
Conventions and the Eval Dashboard to this same group"); delete the half of the
comment this lesson fulfils.

### D11 — The cheap model is the default, not a setting nobody changes

`FEATURE_MODELS`'s `conventions` entry defaults to `openai` / `gpt-5.4`. The
brief calls for a low-cost model, and a default is what actually runs. Change
the registry default to **`openrouter` / `anthropic/claude-haiku-4.5`** in
**both** vendored copies. The two `platform.ts` files are currently
byte-identical, so a symmetric edit adds no drift. Settings → Feature Models
keeps overriding it per workspace, and `resolveFeatureModel(container,
workspaceId, 'conventions')` is unchanged.

That exact string is `seed-skills.ts`'s `LESSON_AGENT_MODEL` — the model both
L02 lesson agents already run on, chosen because `reviewer-core`'s INSIGHTS
records the seed's `deepseek/deepseek-v4-flash` hanging >10min on a real
reviewer prompt. It needs **no key the install doesn't already need**: the
seeded agents cannot run at all without `OPENROUTER_API_KEY`, so conventions
extraction inherits a key that is already required, rather than introducing a
second provider a workspace may have no credentials for. `onboarding` already
defaults to an `openrouter` slug, so the registry has the precedent.

**Provider, not just model.** The `Provider` enum's `'anthropic'` means the
first-party Anthropic API via `ANTHROPIC_API_KEY`; running Haiku through
OpenRouter is `provider: 'openrouter'` with the slug
`anthropic/claude-haiku-4.5`. The two are different credentials and different
strings (`claude-haiku-4-5` vs `anthropic/claude-haiku-4.5`) — pick the slug,
and do not "normalise" it to `model-router.ts`'s `CHEAP` entry, which names the
first-party id.

Cost attribution is unaffected: `container.buildLlm` injects `PriceBook` into
the OpenRouter provider, which serves **live** per-model prices from
OpenRouter's `/models` and falls back to `adapters/llm/pricing.ts` only while
the cache is cold. An OpenRouter slug missing from the static table is
therefore priced at runtime, not dropped — which is why every seeded agent
already runs on a slug that table does not list.

---

## 3. Server

### 3.1 Migration

Additive, generated the documented way — edit `db/schema/knowledge.ts`, then
`pnpm db:generate` in `server/`. Never hand-write it, and never touch
`0000_init.sql`.

```ts
// conventions
status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
  .notNull().default('pending'),
scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
createdAt: now(),

// new table
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  sampleCount: integer('sample_count').notNull(),
  model: text('model').notNull(),
  createdAt: now(),
});
```

`accepted` is **not** dropped: it is in the shared `ConventionCandidate`
contract in both copies, and the card reads it. It becomes derived state that
only the repository writes, always together with `status`.

Add `status` to `ConventionCandidate` in **both** vendored copies:
`status: z.enum(['pending', 'accepted', 'rejected'])`. The list never carries a
`rejected` row (D2), but the field is what lets a test assert a rejection stuck
without reading the DB.

`integer` is not yet imported in `schema/knowledge.ts` — add it to the
`drizzle-orm/pg-core` import alongside `doublePrecision`.

Register `conventionScans` in `db/schema.ts`'s barrel and add
`ConventionRow` / `ConventionScanRow` to `db/rows.ts`, per that file's
convention.

### 3.2 Module — `server/src/modules/conventions/`

Same ring model and file roles as `skills/`: `routes.ts` · `service.ts` ·
`repository.ts` · `helpers.ts` · `constants.ts`, plus `prompt.ts` for the
message assembly.

```
GET  /repos/:id/conventions          → { scan: Scan | null, candidates: ConventionCandidate[] }
POST /repos/:id/conventions/extract  → same shape, 200 (D7 — synchronous)
PUT  /conventions/:id                → ConventionCandidate   (status only)
PUT  /repos/:id/conventions/status   → ConventionCandidate[] (Accept all / Deselect all)
POST /repos/:id/conventions/skill    → Skill 201             (the merge, D8)
```

Every route declares a `response:` schema over `ApiErrors` (+ `NotFound` where
it resolves by id), per the repo-wide decision in `.context/insights`. `Scan`
is a route-local Zod object (`{ id, sample_count, model, created_at }`) — like
the `SkillVersion` in `server/src/modules/skills/routes.ts`, nothing outside
the server needs it, and keeping it local preserves the no-new-drift property.

`PUT /conventions/:id` takes `{ status }` and nothing else. The rule, evidence
and confidence are **not** patchable: the evidence is the output of the gate,
and a hand-edited rule would carry a confidence and a snippet that no longer
describe it. Editing happens on the merged body in the modal, which is the
design's only editing surface (§4.3) and the answer already given in session.

`repository.ts` — workspace-scoped throughout:
`latestScan(workspaceId, repoId)` · `listForRepo(workspaceId, repoId)`
(excluding `rejected`, ordered by `confidence` DESC) ·
`setStatus(workspaceId, id, status)` · `setStatusAll(workspaceId, repoId,
status)` (pending↔accepted only — "Accept all" never rejects) ·
`insertScan(...)` · `insertCandidates(...)` ·
`deletePending(workspaceId, repoId)` · `listSettled(workspaceId, repoId)` for
D3's dedupe. Register it on the container as `conventionsRepo`.

### 3.3 The extraction pipeline — `service.extract(workspaceId, repoId)`

1. Resolve the repo; **422 when it has no `clonePath`** — the seeded
   `acme/payments-api` has `clonePath: null` and is not on disk, so this is the
   first thing anyone will hit (§5).
2. `getConventionSamples(repoId, SAMPLE_FILE_COUNT)` (12) + the config list
   (D5). Read each through `GitClient.readFile`, skipping failures. Truncate
   each to `MAX_FILE_LINES` and the whole set to `MAX_SAMPLE_CHARS`; a
   truncated file is marked so the model does not cite past the cut.
3. `resolveFeatureModel(container, workspaceId, 'conventions')` → provider +
   model; `container.llm(provider)`.
4. `completeStructured({ model, schema: ConventionExtraction, schemaName:
   'ConventionExtraction', messages })`. The system prompt lives in
   `src/prompts/conventions.system.md` and is loaded with `renderPrompt` — the
   instruction text is stable, the file list is per-request data (the rule
   `platform/prompts.ts` already states). It asks for house rules that are
   **observable and enforceable in review**, each with a verbatim snippet and
   its path, and says explicitly that a rule without a quotable snippet must be
   omitted rather than invented.
5. Every file body is wrapped as untrusted data before it goes in the message —
   the same `wrapUntrusted` (`platform/prompt.ts`, re-exported from
   `reviewer-core`) treatment `run-executor` gives a PR body. A repo
   file is exactly the place a prompt injection would sit.
6. Gate each candidate (§3.4), drop duplicates of settled rules (D3).
7. In one transaction: `deletePending`, `insertScan`, `insertCandidates`.
8. Return `{ scan, candidates }` and log `Extracted N candidates from M files
   (K discarded: no evidence)`.

### 3.4 The gate — `helpers.ts`, pure, no DB and no FS

Pure so it unit-tests without Docker; the caller hands it file contents.

```ts
parseEvidencePath(raw): { path: string; start?: number; end?: number } | null
normalizeSnippet(s): string[]            // trim, drop blanks, collapse runs of spaces
locateSnippet(lines, snippet): { start: number; end: number } | null
groundCandidate(candidate, files): GroundedCandidate | null   // D6, steps 1–3
dedupeKey(rule): string                  // lowercased, punctuation-stripped, for D3
```

`groundCandidate` returns the candidate with `evidence_path` **rewritten** to
the located range (D6), or `null`.

`buildSkillDraft(repoName, accepted)` is the TypeScript twin of the design's
`conventionsToDraft` + `slugifyRule` (`screen_conv_conf.jsx:4`). It is the one
place the merge format is written down, and it is **copy-exact** — this is the
text that ends up in a prompt, so transcribe it rather than paraphrase:

````ts
name        = accepted.length === 1 ? slugify(accepted[0].rule) : `${repoName}-conventions`
description = accepted.length === 1 ? accepted[0].rule
                                    : `${accepted.length} house conventions extracted from ${repoName}`
type        = 'convention'
enabled     = true

body = `# ${name}\n\n` +
  `House conventions for \`${repoName}\`. Flag changes that violate any rule ` +
  `below and cite the offending \`file:line\`.\n\n` +
  accepted.map((c) =>
    `## ${slugify(c.rule)}\n${c.rule}.\n\n` +
    `Detected in \`${c.evidence_path}\`:\n\n` +
    '```\n' + c.evidence_snippet + '\n```'
  ).join('\n\n')
````

Note the details that are easy to lose: the rule gets a **trailing period**
appended (`${c.rule}.`), the repo name in the preamble is the bare name
(`payments-api`), not `owner/name`, and `slugify` lowercases, strips backticks,
collapses to dashes, drops a fixed stop-word list and keeps the **first four**
words — all of it in `screen_conv_conf.jsx:4-8`.

---

## 4. Client

### 4.1 Routes and files

```
app/repos/[repoId]/conventions/page.tsx                    → <ConventionsView />
app/repos/[repoId]/conventions/loading.tsx                 "use client"
app/repos/[repoId]/conventions/_components/ConventionsView/ {…, constants, helpers, styles, index}
        └ _components/ConventionCard/                       {…, styles, index, test}
        └ _components/CreateSkillModal/                     {…, helpers, index, test}
lib/hooks/conventions.ts   useConventions · useExtractConventions
                           · useSetConventionStatus · useSetAllConventionStatus
                           · useCreateSkillFromConventions
```

Keep the in-page `isLoading` skeleton branch **as well as** `loading.tsx` —
client `INSIGHTS.md` records why (`loading.tsx` has already resolved before a
TanStack Query fetch starts).

Prefer `import type` from `@devdigest/shared`; a **value** import passes
`typecheck` and `test` and fails only in `next build` and the dev server
(client `INSIGHTS.md` → Codebase Patterns).

### 4.2 `ConventionsView` — transcribed from `ScreenConventions`

`AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}`
— _"Skills Lab › Conventions"_, the artboard's crumb, and both keys are already
in `conventions.json`. Guard an unknown `:repoId` with `useRepoNotFound(repoId)`
→ `notFound()`, the way `/repos/[repoId]/pulls/page.tsx` does; a repo-scoped
route that renders a header for a repo that is not in the workspace is the bug
that guard exists for.

Body: `padding: "20px 28px 40px"`, `maxWidth: 880`, `margin: "0 auto"`. Header:
`h1` at `fontSize 22 / fontWeight 700 / letterSpacing -0.02em`, _"Conventions in "_
+ mono accent repo name; subtitle _"Detected from N sample files · last scan <relative>"_ from the
scan row (D4); right, a `secondary` `sm` `RefreshCw` **Re-scan** that shows
`page.scanning` while the mutation is in flight.

Toolbar: a `ghost` `sm` button toggling `Check`/"Accept all" ↔ `X`/"Deselect
all" on whether every listed candidate is accepted; then _"N of M accepted"_;
then, right-aligned, a `primary` `sm` `Sparkles` **Create skill**, disabled
with `opacity: 0.5` when nothing is accepted — the artboard's own affordance.

Empty state (`e-conv`): `EmptyState` `icon="ListChecks"` with
`page.empty.{title,body,cta}` and `onCta` running the extraction. The artboard
renders it **instead of** the whole page body — no header, no toolbar — and it
is shown when there is **no scan**.

**Not drawn:** a scan that ran and produced zero surviving candidates. The
artboard has no state for it, and falling back to `e-conv` would claim the repo
was never scanned (D4's whole point). Keep the header and subtitle so _"last
scan 2m ago"_ stays visible, and render the existing `page.candidateCount` key
("{count, plural, …} · grounded against sampled files") at zero beneath it.
That key is from the same older iteration as `card.acceptAsSkill` and has no
place in the current artboard — this is the one spot where reusing it is better
than adding a key.

### 4.3 `ConventionCard`

Per the artboard: 1px border, `borderLeft: 3px solid` — `var(--ok)` when
accepted, `var(--border)` otherwise — radius 9, padding 16.

- the rule, `fontSize 14`, `fontWeight 600`, **italic**;
- the evidence box: header strip with `MonoLink` on `evidence_path` and a
  `Copy` icon; `<pre className="mono">` body on `var(--code-bg)`,
  `fontSize 11.5 / lineHeight 1.55`. The artboard's `Copy` has no handler, so
  what it copies is a choice: copy the **snippet**, since the path is already
  selectable text beside it;
- `Confidence` label at `fontSize 11` muted, a 90px-wide `ProgressBar` with
  `height={5}`, coloured `var(--ok)` at `>= 0.85` else `var(--warn)`, and the
  rounded percentage in `mono tnum`;
- right column, `width: 150`: **Accept** (`secondary`+`Plus` → `primary`+`Check`
  "Accepted") over **Reject** (`ghost`+`X`), both `full`.

Card copy comes from `conventions.json`'s `card.*`; add `card.accept`,
`card.reject` and `card.copyEvidence`, leaving `card.acceptAsSkill` unused
(D1).

### 4.4 `CreateSkillModal` — transcribed from `conv-create`

`Modal width={760}`, title _"Create skill from conventions"_, subtitle = the
draft name. Then, in order:

- the merge banner: `Wrench` in `var(--accent)` on `var(--accent-bg)`, reading
  _"Merged from **N accepted conventions** in `<repo>`. Everything below is
  editable before you save."_;
- `FormField` **Name** (required, mono `TextInput`);
- `FormField` **Description**;
- a row of **Type** (`SelectInput` over the four `SkillType` values, defaulting
  to `convention`) and **Enabled** — a `FormField` hinted _"Whether this block
  is added to agents' prompts."_ wrapping a `Toggle size={17}`, on — side by
  side, each in a `flex: 1` column with `gap: 14`;
- `FormField` **Skill body** (required) with the artboard's hint verbatim —
  _"The only text sent to the model. Merged from the accepted rules + evidence
  — edit freely."_ — wrapping `CodeEditor` at `filename={name}.md`;
- footer: `GitCommit` + _"Saved as v1 · added to Skills Lab"_ pushed left, then
  `Cancel` / `Create skill`.

**This is a different component from the existing `CreateSkillModal`** at
`client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/`.
The design has the same name collision (`screen_conv_conf.jsx` defines its own),
and the two must not be merged: this one has **no provenance checkbox** — the
source is decided server-side (D8) — and it has the merge banner that one does
not. Copying that component and deleting the checkbox will silently carry
over its `source_is_external` posting.

The draft is computed **client-side** on open, from the accepted candidates,
by a `helpers.ts` port of `conventionsToDraft` — the user edits a draft, not a
server round-trip. Nothing is written until **Create skill**; closing the modal
leaves no row behind. On success, invalidate `["skills"]` and route to the new
skill's editor at `client/src/app/skills/[id]/`, which already exists.

### 4.5 Nav and i18n

- `vendor/ui/nav.ts`: append `{ key: "conventions", label: "Conventions",
  icon: "ListChecks", href: "/repos/:repoId/conventions", gKey: "c" }` to
  **SKILLS LAB**, after `agents` (D10), and add `g c` to `SHORTCUTS`.
- `app/layout.tsx`: add `"conventions"` to `USED_NAMESPACES`. Omitting it is a
  **render-time missing-message error, not a build error** (client
  `INSIGHTS.md`) — the single most likely way to ship this broken.
- `messages/en/conventions.json`: keep every existing key; add `card.accept`,
  `card.reject`, `card.copyEvidence`, `page.acceptAll`, `page.deselectAll`,
  `page.acceptedCount`, `page.sampleSubtitle`, `page.notCloned`, and the
  `modal.*` block for §4.4's labels, hints, banner and footer.

---

## 5. Seeds

The seeded repo **cannot be extracted from**: `acme/payments-api` is inserted
with `clonePath: null` and nothing is ever cloned for it (`db/seed.ts:116`).
Pressing "Run extraction" on a fresh install therefore hits §3.3's 422 — which
is correct behaviour and a bad first impression, and is also why the e2e lane
cannot drive the extraction itself (no LLM in e2e, by rule).

So seed the **output**, idempotently: one `convention_scans` row
(`sample_count: 84`, matching the design's subtitle) and the three candidates
from `data.jsx`'s `CONVENTIONS`, verbatim — the async/await rule (0.91), the
typed-`Result` rule (0.78) and the Redis-singleton rule (0.85), all `pending`.
That is what the design draws, it exercises both confidence colours around the
0.85 boundary, and it gives the e2e flow something deterministic to assert.

These rows bypass the gate by construction, which is fine: they are fixtures of
a scan that already ran, not candidates awaiting verification. They are **not**
diffs, so the "no hand-written hunk headers" rule (server `INSIGHTS.md`) does
not apply.

The i18n key `page.notCloned` covers the 422 on a repo added from a URL but not
yet cloned.

---

## 6. Tests

Typological, per `TESTING.md`.

| Suite | Covers |
|---|---|
| server unit | `parseEvidencePath` — bare path, `path:12-20`, `path:12`, garbage → null |
| server unit | `locateSnippet` / `groundCandidate` — snippet found at the claimed range; found elsewhere → range **repaired**, not dropped; not found → dropped; path not in the sampled set → dropped |
| server unit | `buildSkillDraft` — one accepted rule names the skill after the rule; several name it after the repo; each rule renders one `## slug` + fenced evidence |
| server unit | `dedupeKey` collapses casing/punctuation so a re-scan suppresses a settled rule |
| server unit | `/conventions` route smoke against the mock container, with `MockLLMProvider`'s `structuredBySchema: { ConventionExtraction: … }` |
| server integration `conventions.it.test.ts` | extract → candidates persisted with a scan row; reject → gone from `GET`, still in the DB as `rejected`; re-scan → `pending` replaced, `accepted` and `rejected` survive, the rejected rule is **not** re-proposed (D3); accept-all → every listed row accepted, none rejected; workspace scoping on every route |
| server integration | `POST /conventions/skill` writes `source: 'extracted'`, `version: 1` and one `skill_versions` row — and the skill is then linkable to an agent |
| server integration | a run by an agent linked to that extracted skill persists a `prompt_assembly.skills` with the body **unwrapped** (D9) — the assertion that pins the trust decision |
| client | `ConventionCard` renders the rule, path, snippet and percentage; Accept fires with the id; Reject fires with `rejected`; the bar is `--ok` at 0.85 and `--warn` at 0.78 |
| client | `ConventionsView` disables **Create skill** with nothing accepted, and the toolbar flips between Accept all / Deselect all |
| client | `CreateSkillModal` drafts one body containing a `## ` section per accepted rule, and posts the **edited** body rather than the draft |
| e2e | `09-conventions.flow.json` — boot → repo → Conventions → the three seeded candidates listed → accept one → Create skill → modal open. Deterministic `--url` / `--text` / `find` only; the extraction itself is never driven (no LLM) |

Integration tests **must** use the `*.it.test.ts` suffix — anything importing
`test/helpers/pg.ts` is excluded from the unit lane by that glob alone.

---

## 7. Out of scope

- **N8 Conformance Report** (`ScreenConformance`, `CONFORMANCE`, the
  `conformance` artboards). It shares `screen_conv_conf.jsx` and nothing else —
  different table, different route, different lesson. Do not build it because
  it is in the file you are transcribing from.
- **Inline editing of a rule or its evidence.** §3.2 says why; the modal is the
  editing surface.
- **A second extraction pass over the accepted set** (the mock's
  `ConventionFileSelection`). D5.
- **Embedding conventions into `memory`** for retrieval at review time. The
  `memory` table has a `'convention'` kind and a `vector` column; wiring it is
  L07's persistent memory, not this.
- **Conformance-style scoring** of a PR against the extracted conventions.
  The skill does that through the normal review prompt; a dedicated score is
  L06.
- **Per-convention skills** (D1) and the file / URL / community import paths,
  which the Skills Lab also deliberately omits.

---

## 8. Acceptance

1. `Conventions` appears in the sidebar's **SKILLS LAB** group after `Agents`,
   opens `/repos/:repoId/conventions` for the active repo, and `g c` works.
2. A fresh install shows the three seeded candidates with their evidence,
   confidence bars (two green, one amber) and the subtitle _"Detected from 84
   sample files · last scan …"_.
3. **Accept** turns the button primary, flips the card's left border to
   `var(--ok)` and moves the _"N of M accepted"_ counter; it survives a reload.
4. **Reject** removes the card; a reload does not bring it back; the row is
   still in the DB as `rejected`.
5. **Accept all / Deselect all** toggles every listed candidate and never
   touches a rejected one.
6. **Create skill** is disabled at 0 accepted; at N it opens the modal with a
   banner reading _"Merged from N accepted conventions"_, a name, and a body
   holding one `## <slug>` section with a fenced evidence block per accepted
   rule.
7. Editing the body in the modal and confirming creates **one** skill, `v1`,
   `type: convention`, `source: extracted`, enabled — visible in the Skills Lab
   with the `Wrench` / "Extracted" label — carrying the **edited** text.
   Cancelling writes nothing.
8. Linking that skill to an agent and running a review shows its body in the
   trace's Skills block **without** an `<untrusted>` wrapper (D9), under its own
   `## <name>` heading.
9. On a cloned, indexed repo, **Run extraction** returns candidates whose every
   `evidence_path` names a real file and whose snippet is actually at the cited
   lines; deliberately corrupting a model response's snippet in a unit fixture
   drops that candidate.
10. **Re-scan** replaces the pending set, leaves accepted and rejected rows
    alone, and does not re-propose a rejected rule.
11. `make test` and both `typecheck` lanes pass;
    `diff -r client/src/vendor/shared server/src/vendor/shared` reports the same
    known-drifted files as before — §3.1's `status` and D11's model default must
    each land in **both** copies.
12. Extraction runs on a workspace configured only with `OPENROUTER_API_KEY` —
    the key the seeded agents already require — with no second provider
    credential added (D11).

---

## 9. Open question

**None blocking.** One worth flagging at build time: §3.3 step 2's budget
(`MAX_FILE_LINES`, `MAX_SAMPLE_CHARS`) is guessed, not measured. Set it from
one real run against a mid-sized repo before the numbers get written into a
constant anyone trusts.
