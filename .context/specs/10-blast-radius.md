# 10 — Blast Radius

**Lesson:** L04 part 2 (Blast Radius; `devdigest-mcp` is spec 09) | **Scope:** repo-wide (a small repo-intel facade fix, both `vendor/shared` copies, a new server `blast/` module, the client Overview card, e2e, and the `mcp/` tool body)
**Status:** ready
**Goal:** A reviewer sees what a PR can affect beyond its own diff. The PR page's Overview tab shows a **Blast radius** card in the right column of the brief grid.
- The card opens with a stat line: changed symbols, callers, endpoints and crons.
- Below it is one row per changed symbol that has callers. Each row lists its callers as `file:line` links to GitHub, then chips for the endpoints and crons in those caller files.
- When the repo index is missing, partial or failed, the card says so instead of showing an empty map.
- The same data reaches Claude Code through the MCP tool `get_blast_radius`.

Everything is read from the index repo-intel already built: there is no model call and no fresh analysis. `GET /pulls/:id/blast` calls the facade once and maps `BlastResult` → `BlastRadius`.

Built from the artboards and the live code only. Removed implementations in git history are off-limits (root INSIGHTS, 2026-09-16).

## Design reference

| Surface | Contributes |
|---|---|
| `.context/docs/design/src/screen_pr_detail.jsx:65-80` `BriefCard` | Blast radius is the **right column** of the 2-column brief grid: `SectionLabel icon="Workflow"` "Blast radius", then the component |
| `src/blast.jsx:3-11` `BlastRadiusSummary` | Stat line: `Code` n symbols · `CornerDownRight` n callers · `Globe` n endpoints · `Clock` n cron. Number bold `--text-primary`; label `--text-secondary` 12.5px; icon `--text-muted` 13px |
| `src/blast.jsx:25-48` `BlastRadiusTree` | Row: chevron (rotates 90° when open) · `Code` icon `--accent` · mono `name()` 600 · "N callers" muted, right-aligned. An open row has bg `--bg-hover`. Children: `CornerDownRight` + `MonoLink file:line` with tree guide lines (`TreeRow`, `:13-24`); endpoint `Badge mono icon=Globe color=--accent-text bg=--accent-bg`; cron `Badge mono icon=Clock color=--warn bg=--warn-bg` |
| `src/blast.jsx:75-87` `BlastRadius` | Tree/Graph segmented toggle, right of the stat line |
| `src/data.jsx:48-75` `BLAST` | Fixture; summary "2 functions changed → 14 callers, 3 endpoints, 1 cron" |

User screenshots (session images 11 and 13):
- Image 11 is the tree above, as rendered.
- Image 13 adds the caller **name**, muted and right-aligned on each caller row, and ellipsises long paths.

The Graph view and "Prior PRs touching these files" are **out of scope** (user decision). The Graph button stays, disabled.

---

## 1. What already ships

| Layer | Fact | Where |
|---|---|---|
| Facade | `getBlastRadius(repoId, changedFiles)` → `BlastResult {changedSymbols[{file,name,kind}], callers[{file,symbol,viaSymbol,line,rank}], impactedEndpoints, factsByFile?, degraded?, reason?}` | `server/src/modules/repo-intel/service.ts:220`; `repo-intel/types.ts:53-88` |
| Facade | Persistent path (index `full` **or** `partial`) → `degraded: false`, plus `factsByFile` {endpoints, crons} per caller file | `service.ts:315-389` |
| Facade | Fallback path (ripgrep over `container.codeIndex`; needs a clone) → always `degraded: true, reason: 'no_data'`, **even when it finds callers**. It returns no `factsByFile`, no crons and no cap | `service.ts:228-303` |
| Facade | Persistent callers are rank-sorted, then `callers.slice(0, MAX_CALLERS_PER_SYMBOL)`: a **global** cap of 20. The constant is documented as "per changed symbol" | `service.ts:386`; `repo-intel/constants.ts:29-30` |
| Facade | Callers are already deduped on `file|enclosing|viaSymbol`; `enclosing` falls back to the file basename | `service.ts:272,354-369` |
| Facade | Only the clone read and `codeIndex` calls are caught. A DB error in `getRepoBasics`/`getSymbolRows`/`getResolvedCallers`/`getFileFacts` propagates (→ 500) | `repo-intel/repository.ts:136,486,503,534` |
| Facade | `getIndexState` never throws. A partial index has `degradedReason` undefined. A repo with no clone gets a persisted `status:'degraded'` row with reason `no_data` | `service.ts:189-206`; `repository.ts:205-241`; `pipeline/full.ts:83-93` |
| Index | `references.decl_file` resolves only through `file_edges` import edges to **exported** symbols, so a persistent caller is always in another file | `repo-intel/repository.ts:400-425` |
| Index | Line numbers come from the clone at `last_indexed_sha` (the default-branch HEAD), not from the PR head | `pipeline/full.ts:271`; `pipeline/incremental.ts:265` |
| Index | Endpoints are `"METHOD /path"`; crons are raw cron expressions or `job:<kind>`; both are recorded per file | `server/src/adapters/codeindex/extract.ts:182-214` |
| Flag | `REPO_INTEL_ENABLED=false` → `config.repoIntelEnabled` false (default on) | `server/src/platform/config.ts:90` |
| PR files | `pr_files` is filled only by `GET /pulls/:id` (GitHub refresh) or the seed. It has no order (server INSIGHTS 2026-09-23). A PR synced but never opened has **0 rows** | `server/src/modules/pulls/routes.ts:235-274` |
| Contract | `ChangedSymbol`, `BlastCaller`, `DownstreamImpact`, `BlastRadius`: unused, identical in both copies, and embedded in `PrBrief.blast` | `vendor/shared/contracts/brief.ts:63-90` (both copies) |
| Client | Overview has a placeholder Card, "L04 replaces this" | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:46-54` |
| Client | `OverviewTab` gets `{prId, reviews, runs}` only; the page has `repoFullName` and `pr.head_sha` | `…/pulls/[number]/page.tsx:91,139,151` |
| Client | `githubBlobUrl(repoFullName, sha, file, startLine)` | `client/src/lib/github-urls.ts` |
| Client | `client/messages/en/blast.json` exists but is unused, and **`blast` is not in `USED_NAMESPACES`** | `client/src/app/layout.tsx:21-32` |
| UI kit | `MonoLink` takes only `{children, onClick, href}`; it has no `title` or `style` | `client/src/vendor/ui/primitives/MonoLink.tsx:3-12` |
| Runtime | Only seeded `acme/payments-api`, `clone_path: null` → blast is degraded `no_data` | `GET /repos`, 2026-09-25 |
| MCP | The `get_blast_radius` placeholder resolves the repo and PR (no sync) and returns `status:'not_implemented'`, `readOnlyHint: true` | `mcp/src/tools/get-blast-radius.ts` (commit `019f3ba`) |
| MCP | Output schema `BlastRadiusOutputSchema` `{status: ok\|degraded\|not_implemented, repo, pr_number, changed_symbols, downstream, summary, degraded_reason: string\|null, truncated, next_step?}`. It is **not advertised**: no `outputSchema` (spec 09 D15). An absent `next_step` is **omitted, never `null`** | `mcp/src/tools/schemas.ts:86-109`; spec 09 §6 |
| MCP | Every relayed string goes through `sanitizeUntrusted(text, max, {singleLine})` (spec 09 D13). Caps are in `tools/constants.ts`: `TITLE_MAX` 200, `FILE_MAX` 300, `SUMMARY_MAX` 600. Findings are capped (`CONCISE_MAX_FINDINGS` 15) | `mcp/src/sanitize.ts`; `mcp/src/tools/constants.ts` |
| MCP | `DevDigestApi` exposes named methods only; `test/api-client.test.ts:11-28` asserts the exact list. The fake API routes are in `test/helpers/fake-api.ts` (`defaultRoutes()`) | `mcp/src/api/client.ts` |
| MCP | Description budget: each ≤ 450, all 5 ≤ 2,000, enforced by `test/tools-list.test.ts`. Currently 1,655 in total, 284 of it for blast. `README.md:15` still says "Not implemented yet" | spec 09 §6 "Budget" |

### Lesson text vs live code (the spec follows the code)
1. "20 callers **per symbol**": the persistent path caps **globally**. → Fixed in the facade (D2).
2. "traversal depth of 2": `BFS_DEPTH` is used only by `getCriticalPaths` (`service.ts:686`). Blast is depth 1 (direct references). → Documented only.
3. "`degraded: true` with one of `flag_off`…`no_data`": the facade emits only `no_data`, and a **partial** index comes back as `degraded: false`. → The blast service derives the status from `getIndexState` + config (D4).
4. Spec 09 D11 guessed `GET /pulls/:id/blast-radius` in `modules/repo-intel`. → Use the lesson's `GET /pulls/:id/blast` in a new `modules/blast/` (D1).

---

## 2. Decisions

### D1 — New module `server/src/modules/blast/`, route `GET /pulls/:id/blast`
Files: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `helpers.test.ts`, mirroring `smart-diff/`. Register it in `modules/index.ts`. It gets no container getter.
**Why:** It is the lesson's shape. Blast consumes repo-intel through its port (`repo-intel/types.ts`, ring 2).
**Rejected:** A route inside `modules/repo-intel`.

### D2 — Facade fix, persistent path only: a per-symbol cap and a `truncated` flag
In `tryPersistentBlast`:
- Replace the global `slice` with a per-`viaSymbol` cap in rank order.
- Set the new optional `BlastResult.truncated = true` only when a symbol has a **21st** distinct caller (after the existing dedupe).
- Compute `factsByFile`/`impactedEndpoints` from the **kept** callers' files.

The fallback path is not touched.
**Why:** The constant's own doc and the lesson both say per symbol. The global cut drops whole low-rank symbols and makes the counts wrong. `getBlastRadius` has no other caller. The facade is the only place that knows whether it cut anything. The fix is about 10 lines.
**Rejected:** Also reworking the fallback (cap, facts, crons). It is already reported as degraded, and "display, not recalculate" applies. Re-capping in blast: by then the global cut has already lost data.

### D3 — A new response contract, `BlastRadiusResponse`, in both copies; `BlastRadius` is unchanged
In `contracts/brief.ts` (client and server copies, byte-identical), after `BlastRadius`:
```ts
export const BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data','no_changed_files']);
export const BlastStats = z.object({ symbols: z.number().int(), callers: z.number().int(), endpoints: z.number().int(), crons: z.number().int() });
export const BlastRadiusResponse = BlastRadius.extend({
  status: z.enum(['ok', 'degraded']),
  degraded_reason: BlastDegradedReason.nullable(),
  index_sha: z.string().nullable(),   // the SHA the caller lines come from (D7)
  stats: BlastStats,
  truncated: z.boolean(),
});
```
Each schema gets an inferred type of the same name.
**Why:** `PrBrief` embeds `BlastRadius`, so extending it keeps `PrBrief` stable. The status matches spec 09 D11, so the MCP passes it through. The stats are computed once, so the UI and the MCP cannot disagree. The first five reasons are the facade's own `DegradedReason`.
**Rejected:** Encoding the status in the `summary` text. A third status `partial`, which is really `degraded` + `index_partial` with data present.

### D4 — Status is derived in a pure helper
`deriveBlastStatus({changedFileCount, flagOn, result, indexState})`. The first match wins:
1. 0 changed files → `degraded`, `no_changed_files`. The facade is **not** called.
2. `!flagOn` → `degraded`, `flag_off`.
3. `result.degraded` → `degraded`, with reason `index_failed` if `indexState.status === 'failed'`, else `indexState.degradedReason ?? result.reason ?? 'no_data'`.
4. `indexState.status === 'partial'` → `degraded`, `index_partial`.
5. Otherwise `ok`, reason `null`.

Whatever data exists is always returned; the degraded fallback can have real callers. A DB error in the facade is not caught and surfaces as a 500, which the card shows as its error state.

### D5 — Mapping rules (`toBlastRadius` in `blast/helpers.ts`, pure)
- `changed_symbols`: `{name, file, kind}`, sorted by file, then name.
- `downstream`: callers grouped by `viaSymbol`; **only symbols with ≥1 caller** get a group.
  - Each caller becomes `{name: symbol, file, line}`, in facade order.
  - Per group, `endpoints_affected` / `crons_affected` = the sorted union of `factsByFile?.[file]` over the group's caller files, with a missing entry counting as empty. On the fallback path these are empty; the degraded notice covers it.
  - Groups are sorted by caller count desc, then by symbol.
- `stats`: `symbols` = `changed_symbols.length`; `callers` = the sum of group lengths; `endpoints` / `crons` = the size of the union across groups (so they match the chips).
- `summary` (English, deterministic; the MCP uses it):
  - with callers: `"<S> symbol(s) changed → <C> caller(s), <E> endpoint(s), <K> cron(s)"`, pluralised per count;
  - `ok` and no callers: `"<S> symbol(s) changed, no downstream callers found."`;
  - degraded with no callers: `"Blast radius unavailable: <reason>."`
- `truncated` = `result.truncated ?? false`.

**Known limits (documented, not fixed):**
- `viaSymbol` is a bare name, so same-name symbols in different changed files merge.
- Attribution is per file: every endpoint or cron in a caller file counts as "may depend".
- `changed_symbols` includes non-exported symbols, so the symbols stat can exceed the number of rows (image 13: 14 symbols, 6 callers).

### D6 — Changed files come from `pr_files`
The blast repository has two methods:
- `getPull(workspaceId, prId)` → `{id, repoId} | undefined` (workspace-scoped; the service throws 404 on none);
- `getChangedPaths(prId)` → `selectDistinct({path}).orderBy(path)`.

The route never calls GitHub, so it stays a pure read (the MCP marks it `readOnlyHint`).

### D7 — GitHub links pin to `index_sha ?? headSha`
The service returns `indexState.lastIndexedSha || null`. With no `repoFullName`, the path renders as plain mono text.
**Why:** The caller line numbers come from the indexed commit. Caller files are usually outside the diff, and the PR head may have moved those lines.

### D8 — Card layout: the tree from image 11, plus the right-aligned caller name from image 13
- `BlastRadiusCard` replaces the placeholder in `OverviewTab`'s grid.
- The stat line shows all 4 stats. To its right is a Tree|Graph toggle; **Graph is disabled**, with `title` = `view.graphSoon`. Copy `OrderToggle`'s disabled style into the card's `styles.ts`; do not import it.
- There is one collapsible row per downstream group. Open state is `toggled: Record<string, boolean>` in `useState`, with `isOpen = toggled[symbol] ?? index === 0`, so the first row is open once data arrives.
- A symbol gets `()` when its kind (looked up in `changed_symbols` by name) is `function` or `method`.
- Caller row: `CornerDownRight` + `<span title={file} style={s.callerPath}>` (ellipsis, `minWidth: 0`) wrapping `MonoLink href` with `file:line`. The caller name is muted and right-aligned.
- After the caller rows come the endpoint chips, then the cron chips.
- When `truncated`, one muted line appears under the list.
- Status rules:
  - `ok` with no rows → `noDownstream`.
  - `degraded` → a notice with `status.<reason>`, plus the tree when there are rows.
- Extract a nested row component only if the card passes about 150 lines.

**Rejected:** The card-per-symbol layout (image 13), which does not match the design's toggle and tree.

### D9 — The card owns the `blast` namespace
- Add `blast` to `USED_NAMESPACES`.
- Rewrite `blast.json` (§6.3); it is unused today.
- The `SectionLabel` keeps `brief.block.blast`.
- Delete `brief.blastComingSoon` and the placeholder styles once they are unused.

**Why:** Client INSIGHTS: a namespace missing from the list fails at render.

### D10 — MCP maps the route with the shipped tool's own rules: sanitize, cap, and omit `next_step` when unused
`get_blast_radius` resolves the repo, then the PR (no sync), then calls `api.getBlast(prId)` and fills the **existing** `BlastRadiusOutputSchema`. The schema, `Args`, `INPUT_SHAPE` and the annotations do not change, and `not_implemented` stays in the enum, unused.
- **Sanitize** every relayed string with `sanitizeUntrusted`, because symbol names, paths, endpoints and crons come from the reviewed repo:
  - names, endpoints and crons: `TITLE_MAX`, single-line;
  - files: `FILE_MAX`, single-line;
  - summary: `SUMMARY_MAX`.
- **Cap** with new constants in `tools/constants.ts`: `BLAST_MAX_CHANGED_SYMBOLS = 50`, `BLAST_MAX_DOWNSTREAM = 20`, `BLAST_MAX_CALLERS = 10` per symbol. These keep the route's order, so the top-ranked items come first. `truncated` = the route's `truncated` || any cap hit.
- **`next_step`** (omitted when none applies):
  - `no_changed_files` → "Open <web_url> once so DevDigest loads the PR's files, then call get_blast_radius again.";
  - any other degraded reason → "Index is <reason>: treat missing callers as unknown, not absent. Re-analyze the repo in DevDigest at <webUrl>.";
  - `ok` and truncated → "Showing the top callers only; the full map is at <web_url>.";
  - otherwise omitted.

  Here `<web_url>` = `<webUrl>/repos/<repoId>/pulls/<n>`.

**Why:** spec 09 D9/D13 made size caps and sanitizing the house rule for every tool, and the shipped tool already follows it. The caps are the same numbers the spec 09 D11 seam promised. They cut the list; they compute nothing new. Without them, a PR touching a hub file can return hundreds of callers and blow past the MCP output-token warning.
**Rejected:** A raw 1:1 pass-through. It is unsanitized, repo-derived text, and its size is unbounded.

---

## 3. Facade fix (implementer slice 1)

- `server/src/modules/repo-intel/types.ts`: add `truncated?: boolean` to `BlastResult` ("some changed symbol had more than `MAX_CALLERS_PER_SYMBOL` callers").
- `server/src/modules/repo-intel/service.ts` `tryPersistentBlast` (`:354-389`), per D2:
  - replace the global cap with a per-symbol one;
  - set `truncated`;
  - fetch `getFileFacts` for the kept callers' files only.

  Update the doc comment: per-symbol cap, depth 1.
- `server/test/repo-intel-blast.test.ts` (new, hermetic): T1.

**Verify:** `cd server && pnpm typecheck && pnpm exec vitest run test/repo-intel-blast.test.ts test/repo-intel-facade-degraded.test.ts`.

## 4. Contract (implementer slice 2)

- Add D3's block to `server/src/vendor/shared/contracts/brief.ts` **and** `client/src/vendor/shared/contracts/brief.ts`, identically.
- `server/test/contracts.test.ts`: T2.

**Verify:** `diff client/src/vendor/shared/contracts/brief.ts server/src/vendor/shared/contracts/brief.ts` prints nothing.

## 5. Server `blast/` module (implementer slice 3)

- `repository.ts`: `BlastRepository(db)` per D6. It is the only file that imports `db/*`.
- `helpers.ts`: `deriveBlastStatus` (D4), `toBlastRadius` and `formatBlastSummary` (D5). Types come from `../repo-intel/types.js` (the port) and `@devdigest/shared`. No I/O.
- `service.ts`: `BlastService(container)`, method `get(workspaceId, prId)`:
  1. the pull, or `NotFoundError('Pull request not found')`;
  2. the paths;
  3. none → the `no_changed_files` response;
  4. otherwise `Promise.all([repoIntel.getBlastRadius(repoId, paths), repoIntel.getIndexState(repoId)])`;
  5. derive the status and map.
- `routes.ts`: `GET /pulls/:id/blast`, `params: IdParams`, `response: {200: BlastRadiusResponse, ...ApiErrors, ...NotFound}`. The handler is getContext → service. Add a header comment in the smart-diff style.
- `modules/index.ts`: add the import and a `blast` entry.
- `server/README.md`: add `/pulls/:id/blast` to the API map.
- Tests: T3 (`modules/blast/helpers.test.ts`), T4 (`test/blast.it.test.ts`).

**Verify:**
- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`;
- `make lint-arch` reports **0 errors / 18 warnings** (measured on 2026-09-25; no new warnings);
- `pnpm exec vitest run test/blast.it.test.ts`;
- with `make dev` up, `curl -s 127.0.0.1:3001/pulls/<#482 uuid>/blast` → `"status":"degraded","degraded_reason":"no_data"`.

## 6. Client (implementer slice 4)

### 6.1 Hook: `client/src/lib/hooks/blast.ts`
`usePrBlast(prId)` = `useQuery({queryKey: ["pr-blast", prId], queryFn: () => api.get(\`/pulls/${prId}/blast\`, BlastRadiusResponse), enabled: !!prId})`, with a header comment in the style of `intent.ts`. Do **not** add it to the aggregating `hooks/index.ts` (frontend-architecture § barrels); import it from `@/lib/hooks/blast`.

### 6.2 Card: `…/pulls/[number]/_components/BlastRadiusCard/`
- `BlastRadiusCard.tsx`, props `{prId, repoFullName, headSha}`:
  - loading → `Skeleton` rows;
  - error → `ErrorState` with `blast.error`;
  - otherwise the layout from D8.
- `helpers.ts`:
  - `getSymbolLabel(symbol, changedSymbols)` → `name()` or `name`;
  - `getCallerHref(repoFullName, sha, caller)` → URL | null.
- `constants.ts`: `CALLABLE_KINDS = ['function', 'method']`.
- `styles.ts` (`s`, CSS variables only), an `index.ts` forwarder, `helpers.test.ts` (T5), `BlastRadiusCard.test.tsx` (T6).

### 6.3 Wiring and copy
- `OverviewTab.tsx`: add props `repoFullName: string | null` and `headSha: string | null`; render `<BlastRadiusCard …/>` in place of the placeholder; drop the "L04 replaces this" comment, update the component doc comment (`:18-20`, which still calls the right column a placeholder), and drop the unused placeholder styles and imports.
- `page.tsx:139`: pass `repoFullName` and `pr.head_sha`.
- `app/layout.tsx`: add `"blast"` to `USED_NAMESPACES`.
- `messages/en/brief.json`: delete `blastComingSoon`.
- `messages/en/blast.json` (the full file):
```json
{
  "stat": {
    "symbols": "{count, plural, one {symbol} other {symbols}}",
    "callers": "{count, plural, one {caller} other {callers}}",
    "endpoints": "{count, plural, one {endpoint} other {endpoints}}",
    "crons": "{count, plural, one {cron} other {crons}}"
  },
  "view": { "tree": "Tree", "graph": "Graph", "graphSoon": "Graph view is coming in a later lesson" },
  "callerCount": "{count, plural, one {# caller} other {# callers}}",
  "noDownstream": "{count, plural, one {# changed symbol} other {# changed symbols}}, no downstream callers found.",
  "truncated": "Some symbols have more callers than shown; the highest-ranked files are listed.",
  "error": "Couldn't load the blast radius.",
  "status": {
    "flag_off": "Repo intelligence is off (REPO_INTEL_ENABLED=false); callers come from a text search and may be incomplete.",
    "index_failed": "Indexing this repository failed, so the map may be incomplete. Re-analyze the repository to rebuild it.",
    "index_partial": "The repository index is partial, so some callers may be missing.",
    "repo_too_large": "The repository is too large to index fully, so the map may be incomplete.",
    "no_data": "This repository has no index yet; callers come from a text search and may be incomplete.",
    "no_changed_files": "This PR's changed files aren't loaded yet. Reload the page to fetch them."
  }
}
```

**Verify:** `cd client && pnpm typecheck && pnpm test && pnpm exec eslint .` (no new warnings). Then open `/repos/<acme>/pulls/482` in a browser. The value import of `BlastRadiusResponse` must load (client INSIGHTS, extensionAlias).

## 7. E2E (implementer slice 5)

- `e2e/specs/12-pr-blast.flow.json`: the same opening steps as `10-pr-intent.flow.json`, then:
  - `wait --text "BLAST RADIUS"` (`SectionLabel` uppercases);
  - `wait --text "This repository has no index yet"` (a substring, which avoids the apostrophe);
  - `wait --text "Graph"`.

  Only `--url`, `--text` and `find` are used.
- `e2e/.context/docs/seed-contract.md`: add the row `| This repository has no index yet | acme clone_path null → repo-intel no_data | BlastRadiusCard status notice | 12 |`.

**Verify:** `make e2e`.

## 8. MCP (implementer slice 6)

`mcp/` shipped in `019f3ba`/`e4840f9`. This slice swaps the placeholder body; it adds no new tool and does not change the schema.

- `mcp/src/api/schemas.ts`: add `ApiBlast`, a slim parser listing only the fields the tool reads: `status`, `degraded_reason`, `summary`, `truncated`, `changed_symbols[{name,file,kind}]`, `downstream[{symbol, callers[{name,file,line}], endpoints_affected, crons_affected}]`. In `contract-compat.ts`, add `_Blast = Assert<BlastRadiusResponse extends z.input<typeof ApiBlast> ? true : false>`.
- `mcp/src/api/client.ts`: add `getBlast(prId)` → `GET /pulls/${encodeURIComponent(prId)}/blast` (`requestTimeoutMs`). Add `getBlast` to the exact-method list in `test/api-client.test.ts`.
- `mcp/src/tools/constants.ts`: the three `BLAST_MAX_*` caps (D10).
- `mcp/src/tools/get-blast-radius.ts`:
  - replace the body with D10's;
  - update the file header comment;
  - replace `DESCRIPTION` (361 chars; the total becomes 1,732 of the 2,000 budget) with: "Map what a pull request's changed code can affect: the symbols it changes, their callers (file:line), and the HTTP endpoints and cron jobs in those callers' files. Read-only, precomputed from the repo index, no LLM call. Use it to judge a PR's risk beyond its diff. status is degraded when the index is missing or partial; degraded_reason and next_step say why."
- `mcp/test/helpers/fake-api.ts`: add a `GET /pulls/:id/blast` route to `defaultRoutes()` (a degraded `no_data` body for #482), plus an ok fixture that T7 can swap in.
- `mcp/README.md:15`: make the `get_blast_radius` row describe the tool (one line).

**Verify:** `cd mcp && npm run typecheck && npm test`. With `make dev` up, `make mcp-smoke` (it still lists 5 tools).

---

## 9. Tests

| ID | Suite | Covers |
|---|---|---|
| T1 | server unit `test/repo-intel-blast.test.ts`. Patch `repo` as `repo-intel-facade-degraded.test.ts` does, with `config.repoIntelEnabled: true` and `tryGetIndexState` → `status:'full'`. `getSymbolRows` branches on `paths` (changed files vs caller files). Callers come from **distinct** `fromPath`s so the dedupe keeps them | 25 callers of A + 3 of B: A keeps the top 20 by rank, B keeps 3, `truncated: true`, `getFileFacts` is called with the kept files only. Exactly 20 of A: `truncated` falsy |
| T2 | server unit `test/contracts.test.ts` | `BlastRadiusResponse` parses a full sample and rejects an unknown `degraded_reason`; `BlastRadius` still parses without the new fields |
| T3 | server unit `modules/blast/helpers.test.ts` | grouping by `viaSymbol`; per-group endpoint/cron union; a missing `factsByFile` → empty chips; group sort; zero-caller symbols excluded from `downstream` but counted in `stats.symbols`; the stats unions; all 3 summary forms + plurals; each `deriveBlastStatus` branch in order |
| T4 | server integration `test/blast.it.test.ts`. `buildApp({overrides: {repoIntel: stub as unknown as RepoIntel}})`, precedent `conventions/routes.test.ts`, with `repoIntelEnabled: true` forced in every case (the seeded `no_data` case would read `flag_off` otherwise) | seeded #482 with the real facade → 200 `degraded`/`no_data`, and the body validates against `BlastRadiusResponse`; unknown uuid → 404 envelope; non-uuid → 422; stub with a full index → `ok`, grouped `downstream`, `index_sha` set; a freshly inserted PR with no `pr_files` (smart-diff's setup pattern) → `no_changed_files`, and the stub's `getBlastRadius` is **not called** |
| T5 | client `BlastRadiusCard/helpers.test.ts` | `getSymbolLabel` adds `()` only for function/method; `getCallerHref` → `https://github.com/o/r/blob/<sha>/a/b.ts#L12`, and `null` with no repo name |
| T6 | client `BlastRadiusCard.test.tsx`. `vi.mock("@/lib/hooks/blast", …)` returns `{data, isLoading, isError}` (as `IntentCard` does); messages via `import blast from "@/../messages/en/blast.json"` + `brief`, provider `messages={{ brief, blast }}`; `fireEvent` | the stat line shows 4 counts with plurals ("1 cron"); the first symbol is expanded and the second collapsed, and a click toggles; caller links carry `href` (`index_sha`, falling back to `headSha`) and `target=_blank`; the caller name; endpoint and cron chips; the Graph button is `disabled`; the `truncated` note; degraded `no_data` with no rows → notice only; degraded `index_partial` with rows → notice **and** tree; `ok` with no rows → `noDownstream` |
| T7 | mcp `get-blast-radius.test.ts` (replaces spec 09 T13) | fake route ok → `BlastRadiusOutputSchema.parse(structuredContent)` passes, `status: ok`, fields mapped, `next_step` **absent**; 25 downstream × 15 callers → 20 × 10 and `truncated: true` with the web-URL `next_step`; a zero-width char / newline in a path is stripped; `no_changed_files` → non-error with the open-PR `next_step`; `no_data` → the re-analyze `next_step`; unknown repo → E2 |
| T8 | e2e `12-pr-blast.flow.json` | seeded #482's Overview shows the card, the `no_data` notice and the Graph button |

## 10. Out of scope
- The Graph view (only the disabled button ships) and "Prior PRs touching these files".
- A Re-analyze button in the degraded notice (Q1).
- Reworking the facade's fallback path (no cap, no facts, no crons there).
- Transitive callers (depth > 1) and disambiguating same-name symbols.
- Refreshing `pr_files` from GitHub in the blast route.
- Adding blast to the review prompt, or building a `PrBrief` endpoint.

## 11. Acceptance
- **A1** — `make typecheck test lint test-it` pass. `make lint-arch` still reports **0 errors / 18 warnings**. `diff -rq client/src/vendor/shared server/src/vendor/shared` lists exactly the 5 known drift files (`adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`).
- **A2** — `make e2e` passes, including `12-pr-blast`. In a browser, #482's Overview shows the card, and the old "Coming in a later lesson" text is gone. The console shows no missing-message or module-resolution error.
- **A3 (manual, user)** — Add a real repo (e.g. `dmytrobereznii/dev-digest`); `GET /repos/<id>/index-state` → `status: full`. Open a PR touching an exported function imported by ≥2 files (e.g. `server/src/modules/reviews/helpers.ts`). Check that:
  - the card lists that symbol with ≥2 `file:line` callers and their names;
  - a click opens GitHub at `blob/<index_sha>/<file>#L<line>` on the correct line;
  - the stat counts equal `stats` in the route's JSON.
- **A4 (manual, user)** — The degraded state is shown separately. Either set `REPO_INTEL_ENABLED=false` and restart (→ the `flag_off` notice), or use a repo whose index-state is `partial` (→ the `index_partial` notice plus the tree).
- **A5** — In `make mcp-inspect`, `get_blast_radius` on acme #482 → `status: degraded`, `degraded_reason: no_data`, with a `next_step`. On the A3 PR it returns the same `downstream` as the route, up to the D10 caps. In Claude Code, "Show the blast radius of PR #<n> in <repo>" calls `get_blast_radius` and names the same callers as the card.
- **A6** — The PR description has one line per sub-agent that ran, saying what it produced or found.

## 12. Development plan

The lesson pipeline is `planner` → `implementer` → (`architecture-reviewer` ∥ `plan-verifier`). Spec 09 (`mcp/`) is already on `l04`, so all 6 slices can run in order on this branch.

| Step | Agent | Scope | Verification |
|---|---|---|---|
| 0 | planner | this spec | user review |
| 1 | implementer | §3 facade fix + T1 | §3 verify |
| 2 | implementer | §4 contract + T2 | `diff` of both copies |
| 3 | implementer | §5 server module + T3, T4 | §5 verify |
| 4 | implementer | §6 client + T5, T6 | §6 verify + browser |
| 5 | implementer | §7 e2e (T8) | `make e2e` |
| 6 | implementer | §8 MCP + T7 | §8 verify |
| 7 | architecture-reviewer ∥ plan-verifier | reviewer: blast imports only the repo-intel **port**; `db/*` only in `repository.ts`; hook not in the barrel. Verifier: §11 against the diff, plus §10 | reports; A3–A5 are manual |

## 13. Open questions

None blocking; the defaults are applied above.
- **Q1 [non-blocking]** — Should the degraded notice get a **Re-analyze** button (`useResyncRepoIntel`, then invalidate `["pr-blast", prId]` when `lastIndexedSha` advances)?
  - (a) No, text only. **Default.**
  - (b) Yes, as a follow-up.
- **Q2 [non-blocking]** — Should the persistent-path cap fix (D2) land in this PR?
  - (a) Yes. **Default**: without it, one busy symbol can push every other symbol out of the map.
  - (b) Display the facade as-is and file the bug.
- **Q3 [non-blocking]** — Should `stats.symbols` count all changed symbols, or only **exported** ones?
  - (a) All. **Default**, matching the facade and image 13.
  - (b) Exported only, which needs `exported` on `BlastChangedSymbol`.
