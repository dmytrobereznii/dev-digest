# 01 — Skills in the product

**Lesson:** L02 (`Skills in the product`). The Conventions extractor, listed
under the same lesson in `README.md`, is **not** in this spec — it gets its
own, and the design now draws it (`conv-create` artboard) as a consumer of the
components this spec builds.

**Goal:** a skill is a reusable, editable block of Markdown that an agent
appends to its prompt. Skills live in the database, are managed through their
own CRUD surface, are linked to any number of agents in any order, and show up
as a distinct, inspectable block in the run trace. A skill is **text and
nothing else** — the design says it in the body field's own hint: _"The only
text sent to the model. Editing the body is the entire skill — everything else
is metadata."_

## Design reference

Bundle: `designs_with_skills.html` (extracted 2026-09-20). **Four** surfaces
implement skills, out of eleven that mention them:

| Surface | What it contributes |
|---|---|
| `screen_skills.jsx` | `SkillCard`, `CodeEditor`, the tabbed skill editor (`Config · Preview · Evals · Stats · Versions`), the community drawer |
| `screen_agents.jsx` → `SkillsTab` | the agent-side link/reorder list (unchanged in this bundle) |
| `screen_conv_conf.jsx` → `CreateSkillModal` | the create-skill form, and proof that `CodeEditor` is **shared kit** |
| `screen_trace.jsx` | `Skills loaded` row in the trace Configuration section |

`chrome.jsx` is nav, `data.jsx` / `data2.jsx` are fixtures, and
`components2.jsx`, `screen_dashboard.jsx`, `screen_settings.jsx`,
`screen_export.jsx` render only a count or a filename.

Canvas artboards (`canvas/canvas.jsx` → section `skills-lab`): `skill-config`,
`skill-preview`, `skill-evals`, `skill-stats`, `skill-versions`,
`skill-community`; plus `agent-skills` and `conv-create`. The section subtitle
is the spec in one line: **"List of all skills + per-skill editor (mirrors the
Agent editor)"**.

---

## 1. What the starter already ships

This feature is **much further along than it looks**. Everything below exists
on `main` and must be reused, not rebuilt.

| Layer | Already there | Where |
|---|---|---|
| DB | `skills`, `skill_versions`, `agent_skills` tables, all in migration `0000_init.sql` | `server/src/db/schema/skills.ts`, `agents.ts` |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `CommunitySkill`, `AgentSkillLink`, `AgentVersionConfig.skills` — **identical in both vendored copies** | `*/src/vendor/shared/contracts/knowledge.ts` |
| Server — agent side | `linkedSkills` · `skillIdsForAgent` · `linkSkill` · `unlinkSkill` · `setSkills`; `snapshotVersion` already writes `skills` into `agent_versions` | `modules/agents/repository.ts` |
| Server — routes | `GET /agents/:id/skills`, `POST /agents/:id/skills` (set-whole-ordered-set **or** link-one) | `modules/agents/routes.ts:194` |
| Engine | `PromptParts.skills?: string[]` → `## Skills / rules` section; `PromptAssembly.skills` persisted into the trace | `reviewer-core/src/prompt.ts`, `review/run.ts` |
| Client — trace | The Run Trace drawer **already renders a skills prompt block**, conditionally on `prompt_assembly.skills != null` | `RunTraceDrawer/.../TraceBody.tsx:75` |
| Client — i18n | `messages/en/skills.json` is **written in full** | `client/messages/en/skills.json` |
| Client — kit | `Markdown`, `Toggle`, `FormField`, `TextInput`, `SelectInput`, `Modal`, `Tabs`, `Dropdown`, `Badge`, `EmptyState`, `Skeleton`, `ErrorState` all exist; every icon the artboards use is in the registry (`Edit` is already aliased to `Pencil`) | `client/src/vendor/ui/` |
| Client — routing | `activeKeyFor` already maps `/skills` → `"skills"` | `components/app-shell/helpers.ts` |

**Consequence:** no contract change, therefore **no vendored `shared/` sync
work and no new drift**. The agent↔skill association API is done; only the
agent-side *UI* is missing.

**One migration is needed** — `skill_versions.note` (§2 D8). It is additive,
nullable, and the table is empty in every install, so it carries no backfill
question. Generate it the documented way: edit `db/schema/skills.ts`, then
`pnpm db:generate` in `server/`. Never hand-write it.

### What is actually missing

- `server/src/modules/skills/` — does not exist at all.
- `run-executor.ts` never resolves an agent's linked skills, so
  `prompt_assembly.skills` is `null` on every run ever recorded.
- `reviewer-core` puts skill bodies in the **trusted** part of the prompt,
  un-wrapped.
- Client: no `/skills` route, no `Skills` item in `vendor/ui/nav.ts`, no
  `CodeEditor` in the kit, no `Skills` tab in the agent editor (`TABS` is
  Config-only).
- No seeds, no e2e flow.

---

## 2. Decisions

### D1 — There is no import. There is one editor.

A skill is written or pasted into a Markdown textarea, in the UI, and that is
the only way one is created. **No second entry point**: no file picker, no
`.zip`, no URL fetch, no community drawer — even though the bundle draws the
drawer as its own artboard (`skill-community`) — and no separate "Import"
modal, menu item or route. `Add Skill` opens one thing.

`skills.json` already ships copy for file / URL / community. Those keys stay in
the file, unused, for the lessons that add them — **do not delete them**, and
do not render a menu entry for a path that is not implemented. Its `file.*`
keys (`nameLabel`, `nameHint`, `bodyLabel`, `bodyHint`) describe this editor
accurately and **are** used; in particular `nameHint` already reads _"Optional
— derived from the first heading if blank."_, which is the behaviour §3.1
specifies.

### D2 — One checkbox carries provenance, and third-party bodies are wrapped

The single create form has one extra control: **"This came from a third
party"**, unticked by default.

| Checkbox | `source` | In the prompt | Created |
|---|---|---|---|
| unticked | `manual` | trusted — plain `## <name>` heading | `enabled: true` |
| **ticked** | `imported_url` | `<untrusted source="skill:<name>">…</untrusted>` | `enabled: false`, `needs vetting` |

Ticking it is a claim about where the text came from, not about what it does —
so it stays editable only at creation time. Afterwards the source is shown, not
changed; a skill does not become trusted because someone edited it.

`imported_url` is the existing enum member and both `skills.json` and the
artboard's `SKILL_SOURCE` map label it just `"Imported"` — no contract change
needed to reuse it for a pasted body.

A skill's body is never executed and never interpreted as instructions when it
came from outside. This is the point the lesson's trust segment turns on.
`extracted` and `community` classify as untrusted too, so the Conventions
extractor inherits the rule for free.

### D3 — Mirror the Agents CRUD exactly

Confirmed by the bundle: the canvas section subtitle is _"mirrors the Agent
editor"_, and `ScreenSkillsLab` is structurally `agents/[id]/page.tsx` — a
290px left rail of cards, a header with icon + mono name + type pill + version
badge, and a `Tabs` row over a scrolling body.

Two routes, exactly as agents has two:

- `/skills` — card grid + `Add Skill` + search. Mirrors `/agents`, except that
  `/agents`' `Add Agent` is a `Dropdown` and this is a plain `Button`, because
  D1 leaves it exactly one item. The canvas has no artboard for this route —
  the author drew only the editor — but the empty state (`No skills yet`) needs
  a home and `skills.json` already has its copy.
- `/skills/:id?tab=config` — left rail + tabbed editor. **This is the
  artboard.**

### D4 — Seed agents and skills, not demo PRs

`db/seed.ts` gains the two lesson agents and a set of skills, already linked.
The control-experiment PRs are imported live from a real repo on camera. No
`seed-prs` fixtures — hand-written `@@` hunk headers are verified by nothing
(server `INSIGHTS.md`), and a mis-counted header fails silently.

### D5 — One prompt block, per-skill headings

`PromptAssembly.skills` stays `string | null`. Each skill contributes a
`## <name>` section (or an `<untrusted>` wrapper) inside the single block,
which is the shape the design fixture shows (`data2.jsx` → `TRACE.prompt.skills`).
Widening the contract to an array would mean editing **both** vendored copies
to gain nothing the headings don't already give.

### D6 — Two gates on inclusion

A skill's body reaches the prompt **iff** it is linked to the running agent
**and** `skills.enabled` is true. The global toggle is a kill switch across
every agent; unlinking is per-agent. A linked-but-disabled skill contributes
nothing and leaves no trace of itself — which is what makes the
enabled/disabled demo legible in the run trace.

### D7 — Two of the five tabs ship: `Config` and `Versions`

| Tab | Status |
|---|---|
| **Config** | ships — it *is* the feature |
| **Versions** | ships, with Restore; Diff deferred (D8) |
| Preview | deferred. The body is already visible in `CodeEditor`; a rendered view is polish |
| Evals | L06 — the eval pipeline does not exist |
| Stats | L07/L08 — `pull %`, `accept rate` and `findings30d` need per-skill run attribution nothing records |

`TABS` in `SkillEditor/constants.ts` lists only the two, the way
`AgentEditor/constants.ts` lists only `config` today, and `VALID_TABS` in the
page gates on the same list. The design's five-tab row is the target state, not
this lesson's.

Knock-on: `SkillCard`'s footer in the artboard shows `N agents · X% pull ·
Y% accept`. Only the first is computable — ship `N agents` alone and drop the
other two rather than inventing numbers.

### D8 — Versions carry a note; Restore ships, Diff does not

The artboard's version rows read `v5 · "Tightened scope rule; cap at 5
high-signal findings" · 2026-05-30`. `skill_versions` has no `note` column, so
add one: `note: text('note')`, nullable. The Save form takes an optional
one-line note; blank is fine and renders as an em-dash.

- **Restore** ships: it writes the chosen version's body back as a *new*
  version (never mutates history), noted automatically as `Restored from vN`.
- **Diff** does not. Two-blob markdown diffing means either bending the PR
  diff-viewer to a non-diff input or adding a dependency, for a tab nobody
  opens during the lesson. The button is omitted, not disabled.

### D9 — `CodeEditor` is kit, not a skills component

`screen_conv_conf.jsx` calls `window.CodeEditor`, which `screen_skills.jsx`
exports — the design-reference skill now flags exactly this trap ("A component
can live in a screen module — grep for the name, not the filename"). In the
client it goes to `vendor/ui/kit/CodeEditor.tsx`, is re-exported from the
barrel, and **must be added to `/showcase`** or the smoke test won't cover it.
Read `vendor/ui/README.md` before touching the kit.

### D10 — The fixture's `order` field is list order, not a column

`data.jsx`'s `SKILLS` gained `order: 1…6`. `skills` has no such column and
`agent_skills.order` already owns the ordering that affects the prompt. Read it
as the lab list's display order and sort by `name` — do **not** add a column
for it. If the author meant a user-draggable global order, that is a separate
change with its own migration.

---

## 3. Server

### 3.1 New module — `server/src/modules/skills/`

Follows the onion rings and the file roles the agents module uses:
`routes.ts` · `service.ts` · `repository.ts` · `helpers.ts` · `constants.ts`.

**`repository.ts` — `SkillsRepository`**, workspace-scoped throughout:

- `list(workspaceId)` (ordered by `name`, D10) · `getById` · `deleteById`
- `insert(values)` — writes the row **and** `skill_versions` v1, exactly as
  `AgentsRepository.insert` does for `agent_versions`.
- `update(workspaceId, id, patch, note?)` — a **body** change bumps `version`
  and snapshots the new body + note into `skill_versions`. Name / description /
  type / enabled changes do not. (`agents` versions on any config change; a
  skill's only config *is* its body, so the rule is narrower and needs its own
  `isBodyChange` helper rather than reusing `isConfigChange`.)
- `listVersions(skillId)` (newest first) · `getVersion(skillId, version)`
- `agentsUsing(skillId)` → agent `{ id, name }[]`, for the card footer's
  `N agents` and the delete confirmation.

**Restore lives in the service, not the repository.** It reads a snapshot and
then writes an update — two data operations composed by a rule ("history is
append-only, so restoring is a new version, not a rewind"). That rule is
business logic and belongs in ring 3: `SkillsService.restore(workspaceId, id,
version)` calls `repo.getVersion` then `repo.update(…, 'Restored from vN')`.
Putting it in the repository would be the ring violation the
`onion-architecture` skill exists to catch.

Add `SkillRow` / `SkillVersionRow` to `server/src/db/rows.ts` next to
`AgentRow`; the repository re-exports them, per that file's convention.

Register the repository on the container as `skillsRepo`, beside `agentsRepo`,
because `reviews` needs to reach it without importing another module's folder.

**No index on `skills.workspace_id`.** A workspace holds tens of skills. The
server `INSIGHTS.md` is explicit that an index claim has to be measured at
realistic scale or it is not evidence, and there is no scale here to measure.

**`routes.ts`** — mirrors `agents/routes.ts`, including a `response:` schema on
every route (a route without one cannot trip `isResponseSerializationError`,
and every route in this repo now has one):

```
GET    /skills                             → Skill[]         (workspace-scoped)
GET    /skills/:id                         → Skill
POST   /skills                             → Skill           201
PUT    /skills/:id                         → Skill           (partial patch + optional note)
DELETE /skills/:id                         → { ok: true }    (links cascade)
GET    /skills/:id/versions                → SkillVersion[]  (newest first)
POST   /skills/:id/versions/:version/restore → Skill
GET    /skills/:id/agents                  → { id, name }[]
```

That is the whole surface — there is no `/skills/import` (D1).

`CreateSkillBody` / `UpdateSkillBody` are route-local Zod objects in the
agents-module style: snake_case fields, `body` required on create, `name`
**optional**, `type` defaulting to `custom`. `UpdateSkillBody` carries an
optional `note`, used only when the body changed.

`source` is **never accepted from the client**. `CreateSkillBody` instead
carries `source_is_external: z.boolean().default(false)` — the checkbox — and
the service maps it: `false → 'manual', enabled: true`;
`true → 'imported_url', enabled: false`. The indirection is the point. A client
that could name its own `source` could send `'manual'` for a third-party body
and walk straight past D2; a boolean can only pick between two server-defined
outcomes. `UpdateSkillBody` accepts neither field — provenance is set once, at
creation (D2).

When `name` is absent the service derives it from the first `# H1`, and
`description` from the first paragraph under it. Parsing lives in `helpers.ts`
(`parseSkillMarkdown`) and is pure, so it unit-tests without a DB.

`SkillVersion` is a **new route-local response schema**
(`{ version, note, created_at }` — the body is fetched on demand, not listed),
not a `shared/` contract. Keeping it local is what preserves the no-drift
property; nothing outside the server needs the type. `GET /skills/:id/agents`
likewise responds with a route-local `z.array(z.object({ id, name }))`.

`GET /skills` responds with `Skill[]`, and the shared `Skill` contract includes
`body` — so the list page receives every body it will never render. That is
accepted, not overlooked: a workspace holds tens of skills of a few KB, and a
trimmed list DTO would mean either a second contract or a `.omit()` that the
client then has to model separately. Revisit if a workspace ever holds
hundreds.

Register `skills` in `modules/index.ts` — one import, one entry.

### 3.2 Resolving skills into a run

`ReviewRunExecutor` already holds `this.agents` (`Container['agentsRepo']`),
which already has `linkedSkills(agentId)`. In `executeRuns`, before the
`reviewPullRequest` call:

```ts
const linked = await this.agents.linkedSkills(agent.id);
const skills = linked
  .filter((l) => l.skill.enabled)              // D6 — the global kill switch
  .map((l) => ({ name: l.skill.name, body: l.skill.body, trusted: l.skill.source === 'manual' }));
```

Pass `...(skills.length ? { skills } : {})` — the same omit-when-empty contract
`callers` and `repoMap` use, so an agent with no skills produces a
byte-identical prompt to today's. Log the resolution through `runLog.info` the
way the design fixture's log line reads (`Loaded 3 skills (4,210 tokens)`) so
the live log shows it too.

The error path at `run-executor.ts:436` hard-codes
`prompt_assembly: { …, skills: null, … }`. It stays `null` — a run that failed
before assembly genuinely has no skills block.

---

## 4. `reviewer-core`

`PromptParts.skills` widens from `string[]` to
`Array<{ name: string; body: string; trusted: boolean }>`. It is an internal
engine type, not a `shared/` contract, so this touches no vendored file.

**`run-executor.ts` is the only caller** of `reviewPullRequest` in this repo —
verified, not assumed. `prompt.ts:13` and `run.ts:25` both talk about a
GitHub/CI runner that also calls it; that runner is **not in the starter**
(it arrives with L06's "Export to CI"). Do not go looking for a second call
site to update, and do not widen the type "compatibly" to spare one that
doesn't exist.

`assemblePrompt` renders each entry as:

- `trusted: true` → `## <name>\n<body>`
- `trusted: false` → `## <name>\n` + `wrapUntrusted(\`skill:<name>\`, body)`

joined with `\n\n` into the existing `## Skills / rules` section.
`wrapUntrusted` already strips a body's attempt to close the delimiter.
`INJECTION_GUARD` already tells the model that everything inside `<untrusted>`
is data — third-party skills become one more thing it covers, which is why the
guard was written as one shared rule rather than per-source pattern matching.

Tests: `toReview` and grounding are untouched. Add prompt tests for the trusted
body appearing verbatim, the untrusted body appearing wrapped, an empty list
omitting the section entirely, and a body containing `</untrusted>` being
neutralised.

---

## 5. Client

### 5.1 Kit additions

`vendor/ui/kit/CodeEditor.tsx` (D9), transcribed from `screen_skills.jsx:41`:

- header: `FileText` icon · mono `filename` · `unsaved` Badge when dirty ·
  right-aligned mono `N tokens`, where `N = Math.round(value.length / 4)`;
- body: line-numbered rows at `fontSize 12.5 / lineHeight 21px`, 40px gutter,
  `#`-prefixed lines in `var(--accent-text)` bold, `-` and `1.`-prefixed lines
  in `var(--text-secondary)`;
- `height: 460` fixed, `overflow: auto`.

The artboard's is read-only; ours takes `value` / `onChange` and stays a
controlled `<textarea>` overlaid on the numbered gutter, or a plain textarea
with the gutter alongside. It is an input, not a syntax highlighter — no
CodeMirror, no Monaco.

Add it to the barrel, to the README's **Kit** row, and to `/showcase`.

### 5.2 Routes and files

Transcribed from `app/agents/**` — same folder shape, same naming, same
`_components/` colocation.

```
app/skills/page.tsx                      → <SkillsListView />
app/skills/loading.tsx                   "use client" (the barrel reaches recharts)
app/skills/_components/SkillCard/        {SkillCard.tsx, constants, helpers, styles, index, test}
app/skills/_components/SkillsListView/   {SkillsListView.tsx, constants, helpers, styles, index}
        └ _components/CreateSkillModal/   the only creation surface (D1)
app/skills/[id]/page.tsx                 left rail + tabbed editor, tab state in ?tab=
app/skills/[id]/_components/SkillEditor/ {SkillEditor.tsx, constants, styles, index, test}
        └ _components/ConfigTab/
        └ _components/VersionsTab/
lib/hooks/skills.ts                      useSkills · useSkill · useCreateSkill
                                         · useUpdateSkill · useDeleteSkill · useSkillVersions
                                         · useRestoreSkillVersion · useSkillAgents
                                         · useAgentSkills · useSetAgentSkills
```

**`SkillCard`** (artboard `screen_skills.jsx:19`): 26px rounded type-tinted tile
with the `Sparkles` icon, mono name, `Toggle` (size 14) that stops propagation,
description line, then a row of the type pill in its artboard colour
(`rubric` `#3b82f6` · `convention` `#10b981` · `security` `#ef4444` · `custom`
`#999999`) and the source icon+label (`manual`→`Edit`/"Manual",
`extracted`→`Wrench`/"Extracted", `community`→`Globe`/"Community",
`imported_url`→`Link`/"Imported"). Footer rule + `N agents` when non-zero
(D7). Disabled cards render at `opacity: 0.6`. A `needs vetting` badge when
`source !== 'manual' && !enabled` — `skills.json` has the copy and the tooltip.

`/skills` keeps its `isLoading` skeleton branch **in the page** as well as the
`loading.tsx`. The client `INSIGHTS.md` records why: every page here is a client
component fetching through TanStack Query, so `loading.tsx` has already resolved
before the query starts and covers a different moment. Deleting the branch
leaves the page empty for the whole fetch.

### 5.3 `/skills/:id` — editor header and tabs

Header, per the artboard: type-tinted `Sparkles` tile · mono name · type pill ·
`Badge icon="GitCommit"` reading `v{version}`. The artboard's `Run on evals`
button is Evals-tab machinery — **omit it** (D7) rather than ship a dead
control.

**`ConfigTab`** — `screen_skills.jsx:92`:

- heading `Configuration`, the `v{n}` badge, and an `Enabled` toggle pushed
  right;
- `FormField` **Name** (required, mono `TextInput`);
- `FormField` **Description** — labelled and hinted as the skill's *interface*:
  it is what tells an agent when the skill applies, so it is phrased as a
  directive. Copy goes in `skills.json`;
- `FormField` **Type** — `SelectInput` over the four `SkillType` values;
- `FormField` **Skill body** (required) with the artboard's hint verbatim —
  _"The only text sent to the model. Editing the body is the entire skill —
  everything else is metadata."_ — wrapping `CodeEditor` at
  `filename={name}.md`;
- an optional one-line **note** input beside Save (D8);
- `Save skill` / `Cancel`, with the right-aligned hint _"Saving snapshots the
  body as **v{n+1}**"_ — shown only when the body is dirty, since a
  metadata-only save does not version;
- an untrusted skill shows `preview.untrustedNotice` above the body;
- a **danger zone** below a rule: `Delete skill` in `var(--crit)` with
  _"Removes it from all agents. This can't be undone."_ and a `danger` Button.
  Confirm through `Modal`, naming the agents from `useSkillAgents` — a delete
  that silently strips a skill from three agents is exactly the surprise the
  copy warns about.

**`VersionsTab`** — `screen_skills.jsx:165`: heading, `N versions` badge, the
line _"Every save snapshots the body so eval runs stay reproducible against the
exact text they scored."_, then one row per version — mono `v{n}` chip
(accent-tinted when current), note, date, and either a `Current` dot-badge or a
`Restore` button. No `Diff` button (D8).

### 5.4 Agent editor — Skills tab

`AgentEditor/constants.ts` gains a second entry in `TABS`
(`{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" }`) and
`agents/[id]/page.tsx`'s `VALID_TABS` gains `"skills"`. A new
`_components/SkillsTab/` renders, per `screen_agents.jsx`:

- heading, an `N of M enabled` badge, a filter box;
- the line "Order matters — earlier skills appear earlier in the assembled
  prompt. Drag to reorder.";
- every workspace skill as a row: drag handle (`Menu` icon, `cursor: grab`),
  checkbox square (accent-filled with a `Check` when linked), mono name, type
  pill. Linked rows sort first, in `order`; unlinked follow alphabetically.

Checking, unchecking and reordering all resolve to the same call —
`POST /agents/:id/skills` with the full ordered `skill_ids` — through
`useSetAgentSkills`, which invalidates `["agent-skills", agentId]`. The
set-whole-set endpoint already exists and is idempotent, so the tab needs no
new server surface.

**Linking a skill does not bump the agent's version, and that is deliberate.**
`AgentsRepository.snapshotVersion` writes `config.skills` into `agent_versions`,
but only `update()` calls it — `setSkills` does not. So an agent's latest
snapshot can list skills that no longer match its live links. Leave it. Making
`setSkills` version the agent means a drag-reorder mints a new agent version
per drop, and `agent_versions` exists for eval reproducibility (L06), which has
nothing to replay yet. Note it, don't fix it here.

Drag-and-drop: ship ↑/↓ buttons and note the gap. Ordering is the feature;
dragging is the affordance, and a list of six rows does not justify a
dependency.

### 5.5 `CreateSkillModal` — the only creation surface

Follows `screen_conv_conf.jsx`'s modal exactly, minus its convention-merge
banner: `Modal width={760}`, then

- `FormField` **Name** (mono `TextInput`), hinted with `skills.json`'s existing
  `file.nameHint` — _"Optional — derived from the first heading if blank."_;
- `FormField` **Description**;
- a row of **Type** (`SelectInput`) and **Enabled** (`Toggle`) side by side;
- `FormField` **Skill body** (required) via `CodeEditor`, `filename={name}.md`;
- **the provenance checkbox** — _"This came from a third party"_ — below the
  body, unticked by default. Ticking it swaps the Enabled toggle to off and
  disables it, and reveals `preview.untrustedNotice`: the body will be stored
  as data, delimiter-wrapped, and must be vetted before an agent uses it. The
  toggle is not merely defaulted off, it is **taken away** — a third-party
  skill that could be enabled in the same gesture that admitted it is third
  party would make the vetting step decorative;
- footer: `Saved as v1 · added to Skills Lab` beside `Cancel` / `Create skill`.

Nothing is written until `Create skill` is pressed — that is the brief's
"saving occurs only after confirmation", and pasting a body then closing the
modal leaves no row behind.

`Add Skill` is therefore a plain `Button`, not the `Dropdown` that `/agents`
uses — D1 leaves it exactly one destination, and a one-item dropdown is not a
dropdown. The `Dropdown` comes back with the lesson that adds the other entry
points.

### 5.6 Nav and i18n

- `vendor/ui/nav.ts`: add `{ key: "skills", label: "Skills", icon: "Sparkles",
  href: "/skills", gKey: "s" }` to the `WORKSPACE` group, before `agents`, and
  add `g s` to `SHORTCUTS`.
- `app/layout.tsx`: add `"skills"` to `USED_NAMESPACES`. Without it the
  namespace loads server-side and **never reaches the client** — the failure is
  a missing-message error at render, not a build error (client `INSIGHTS.md`).
- `messages/en/skills.json`: it predates this design. Its `file.*` keys already
  describe the create form and are used as-is. Add keys for the editor tabs,
  the Config form (name/description/type/body labels and hints), the provenance
  checkbox, the danger zone, the versions list and the note field. Keep the
  unused `drawer` / `url` / `community` blocks for the lessons that add them.
- `messages/en/agents.json`: add `editor.tabs.skills`.
- `messages/en/runs.json`: add the per-block token label (§6).

### 5.7 The value-import trap

If any new client file imports a **value** from `@devdigest/shared` (a Zod
schema rather than `import type`), `pnpm typecheck` and `pnpm test` both stay
green while `next build` and the dev server fail with `Module not found: Can't
resolve './contracts/knowledge.js'`. Prefer `import type`. If a value import is
genuinely needed, the change has to be opened in a browser, not just
type-checked. (client `INSIGHTS.md`.)

---

## 6. Run trace — showing the cost of a skill

The trace already renders the skills block; once §3.2 lands it stops being
`null` and appears on its own. Two additions make the control experiment
legible on camera:

1. **A token count on every prompt block**, matching `CodeEditor`'s
   (`Math.round(text.length / 4)`). Put the helper in
   `vendor/ui/kit/CodeEditor.tsx`'s module and reuse it from
   `RunTraceDrawer/helpers.ts` so the editor and the trace never disagree.
   Label it `~N tokens` in the trace: the run's real token count comes from the
   provider and is already in the Stats row, and the two must not be confused.
   This is what makes "with skills vs without" a number rather than a vibe.
2. **A `Skills loaded` row in the trace's Configuration section.** That section
   already exists in `TraceBody.tsx` and is built from `Row` atoms — the new
   row sits after `provider`, rendering the linked-and-enabled skill names as
   mono badges (`—` when none), matching `screen_trace.jsx`'s handling of
   `T.skills`.

   The names have to be persisted, so add `skills: z.array(z.string())
   .default([])` to **`RunTrace.config`** — the object that already holds
   `agent` / `version` / `provider` / `model` / `pr` / `source` — and populate
   it in `platform/trace-builder.ts`. `.default([])` is what keeps every
   already-persisted trace parseable; without it, opening an old run's drawer
   fails validation.

   `contracts/trace.ts` is on the known-drift list, but the drift is **two doc
   comments only** — the schemas are otherwise identical (verified by `diff`).
   So add the field to **both** copies and expect the file to keep differing by
   exactly those comments afterwards.

---

## 7. Seeds

`db/seed.ts` gains, idempotently (the seed re-runs on every `dev.sh`).

**Bodies come from the design.** `data.jsx`'s `SKILL_DETAIL` now carries real
multi-paragraph bodies and a plausible version history for each skill — use
them rather than inventing copy, and seed two versions for at least one skill
so the Versions tab is non-trivial on first boot.

| name | type | source | enabled | body |
|---|---|---|---|---|
| `pr-quality-rubric` | rubric | manual | true | `SKILL_BODY` (`data.jsx`) |
| `test-coverage-nudge` | custom | manual | true | `SKILL_DETAIL.s6.body` |
| `secret-leakage-gate` | security | imported_url | **false** | `SKILL_DETAIL.s3.body` |
| `api-contract-gate` | convention | manual | true | ours — the design has no equivalent |

`secret-leakage-gate` seeds the untrusted state so the `needs vetting` badge
and the `<untrusted>` wrapper are visible on first boot, without anyone having
to tick the provenance checkbox to see them.
`api-contract-gate` is the only body we write ourselves; the lesson's second
control experiment needs it.

**Agents**, linked via `agent_skills` in an explicit order:

- **Test Quality Reviewer** — flags uncovered branches, missed edge cases,
  over-mocking and flaky patterns. Linked: `test-coverage-nudge`,
  `pr-quality-rubric`.
- **API Contract Reviewer** — flags breaking changes to a route signature,
  request/response shape, or status codes. Linked: `api-contract-gate`.

Both are the control experiment: run each against its PR with the skill
unlinked, then linked. The seeded `DEFAULT_MODEL` is
`deepseek/deepseek-v4-flash`, which the `reviewer-core` `INSIGHTS.md` records
as hanging on the real reviewer system prompt — **use
`anthropic/claude-haiku-4.5` for both seeded agents**, or the demo stalls with
no error.

---

## 8. Tests

Typological, per `TESTING.md` — one happy path plus the edge that matters.

| Suite | Covers |
|---|---|
| `reviewer-core` | trusted body verbatim; untrusted body wrapped; empty list omits the section; a body containing `</untrusted>` is neutralised |
| server unit | `parseSkillMarkdown` — H1 name, first-paragraph description, no-H1 fallback; `isBodyChange` |
| server unit | `/skills` route smoke against the mock container |
| server integration `skills.it.test.ts` | create → update body → `version` is 2 and `skill_versions` holds both with their notes; restore v1 → `version` is 3 and history still has three rows; delete cascades `agent_skills`; workspace scoping |
| server integration | a run with one enabled + one disabled linked skill persists a `prompt_assembly.skills` containing only the enabled one — this is D6, and it is the assertion the whole lesson rests on |
| server unit | a `RunTrace` persisted before this change (no `config.skills`) still parses — the `.default([])` guard (§6) |
| client | `SkillCard` renders type pill, source label and `needs vetting`; `CodeEditor` reports the right token count and fires `onChange`; `CreateSkillModal`'s provenance checkbox disables the Enabled toggle and posts `source_is_external: true`; the agent `SkillsTab` check/uncheck fires `setSkills` with the full ordered list |
| client | `/showcase` smoke test covers `CodeEditor` (it fails on a missing export) |
| e2e | `08-skills.flow.json` — boot → `/skills` → seeded skills listed → open one → Versions tab → open an agent's Skills tab. Deterministic `--url` / `--text` / `find` only; no `chat`, no model key |

Integration tests **must** use the `*.it.test.ts` suffix — anything importing
`test/helpers/pg.ts` is excluded from the unit lane by that glob alone.

---

## 9. Out of scope

Named here so the spec's silence is not mistaken for an oversight. Each one is
drawn in the bundle, which is why it needs naming.

- **Preview tab** (`skill-preview`). The kit's `Markdown` primitive would need
  heading / list / fenced-code styling added to match `MarkdownPreview`. The
  body is already legible in `CodeEditor`.
- **Evals tab** (`skill-evals`) and the **Eval panel / Eval Dashboard**. L06.
- **Stats tab** (`skill-stats`) and `SkillCard`'s `pull %` / `accept %`. Needs
  per-skill run attribution. L07/L08.
- **Version Diff** (D8). Restore ships; Diff does not.
- **Every form of import** (D1) — file, `.zip`, URL, and the community drawer
  (`skill-community`). There is no import route, modal or menu item; a skill is
  typed or pasted into the one editor. The brief's "executables in the archive
  are not processed" is satisfied structurally rather than by a filter: a skill
  has nowhere to put an executable, because a skill is a body and some
  metadata. `skills.json` keeps the copy for the lessons that add the other
  paths back.
- **Conventions extractor** and its `CreateSkillModal` (`conv-create`). Its own
  spec, and it consumes this one's `CodeEditor` and `POST /skills`;
  `source: 'extracted'` already exists and D2 already classifies it.
- **Plugin export/import** of skills (`screen_settings.jsx`,
  `screen_export.jsx`). L08.
- **A global `order` column** for skills (D10).

`pr-self-review` in the lesson's final-check list is **this repo's own Claude
Code skill** (`.claude/skills/pr-self-review/`), not product code. It already
exists and needs nothing here.

---

## 10. Acceptance

1. `/skills` lists seeded skills as cards with type pill, source label,
   `N agents` and a working enabled toggle. `Add Skill` is a single button
   opening a single modal — there is no import menu item and no
   `/skills/import` route anywhere in the build.
2. Pasting a body with the provenance checkbox **unticked** stores
   `source: 'manual'`, `enabled: true`, `version: 1`, and writes one
   `skill_versions` row. Leaving Name blank derives it from the body's `# H1`.
3. Pasting the same body with the checkbox **ticked** stores
   `source: 'imported_url'` and `enabled: false`, flags the card
   `needs vetting`, and the Enabled toggle was unavailable in the modal.
   Closing the modal without confirming writes nothing.
4. Editing a body and saving bumps `version`, writes a `skill_versions` row
   carrying the typed note, and the Config hint said `v{n+1}` before the save;
   editing only the name does none of this.
5. `Restore` on an older version makes its body current as a **new** version
   noted `Restored from vN`; the history keeps every row.
6. `Delete skill` confirms by naming the agents that use it, then removes the
   skill and its links.
7. An agent's **Skills** tab links, unlinks and reorders; the order survives a
   reload and is what `GET /agents/:id/skills` returns.
8. A review run by an agent with two linked enabled skills shows **one** Skills
   block in the run trace containing both, each under its own `## <name>`.
9. Disabling one of those skills globally and re-running drops it from the
   block — the other is unaffected.
10. A third-party skill's body appears inside `<untrusted source="skill:…">` in
    the trace; a manual skill's does not.
11. Each prompt block shows a `~N tokens` count using the same helper
    `CodeEditor` uses, and the Skills block's count is the visible difference
    between the two control-experiment runs.
12. An agent with no linked skills produces a prompt with no
    `## Skills / rules` section at all — byte-identical to today's.
13. `make test` and both `typecheck` lanes pass; `/showcase` renders
    `CodeEditor`; `diff -r client/src/vendor/shared server/src/vendor/shared`
    reports the same five known-drifted files as before (§6's `trace.ts` field
    must be added to both copies).
