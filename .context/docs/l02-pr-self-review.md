# PR self-review — l02

**comment** · 0 CRITICAL · 9 WARNING · 24 SUGGESTION
_(2 CRITICAL found, fixed, and re-verified by a second frontend-architecture pass.)_
Base `7946e51` · ~100 files, 2 packages + e2e + skills
Routed: onion-architecture, frontend-architecture, zod, drizzle-orm-patterns,
postgresql-table-design, react-best-practices, react-testing-library,
next-best-practices, security, typescript-expert

## Fixed in this pass — both re-verified

### was CRITICAL — frontend-architecture → a constant used by two segments moves to `src/lib/`
`client/src/app/skills/_components/SkillCard/constants.ts:10`
`SKILL_TYPE_COLOR` had three byte-identical copies and `SKILL_TYPE_VALUES` three more,
spanning `/skills`, `/agents` and `/repos/[repoId]/conventions`.
**Fixed:** promoted to `client/src/lib/skill-type.ts`; six definitions collapsed to one,
and all three colour call sites now go through `skillTypeColor()` so each gets the
fallback. Verified: exactly one definition site remains.

### was CRITICAL — frontend-architecture → styles live in `styles.ts` at the owning rung
`client/src/app/skills/[id]/page.tsx:65`
13 inline `style={{…}}` blocks on a new route with no `styles.ts`.
**Fixed:** extracted to `client/src/app/skills/[id]/styles.ts` at the route rung,
matching the sibling `repos/[repoId]/pulls/[number]/styles.ts`. Verified: zero inline
style objects remain, all 13 keys have a consumer, and the route/editor rung split holds.

## Worth fixing

- **WARNING** `…/ConventionCard/ConventionCard.tsx:73` — `save()` unmounts the editor
  before the mutation settles, so `saving` is dead code and a failed save silently
  reverts with no feedback. **Fix:** await the mutation; keep the editor open on error.
- **WARNING** `client/src/app/skills/_components/SkillCard/SkillCard.tsx:116`
  (and `AgentCard.tsx:78`) — the kit `Modal` is `position: fixed` but rendered inside a
  card that sets `opacity` when disabled, creating a stacking context: the dialog paints
  at 60% and its `z-index` is trapped. **Fix:** portal the Modal to `document.body`.
- **WARNING** `server/src/modules/conventions/routes.ts:62` — body takes
  `ConventionCategory.optional()` while the contract is `.nullable()`, so a category can
  never be cleared. **Fix:** `.nullish()`.
- **WARNING** `server/src/modules/conventions/prompt.ts:44` — extraction accepts an
  unbounded `rule`; the human edit path caps the same field at 300.
  **Fix:** mirror `.max(300)`.
- **WARNING** `server/src/modules/reviews/helpers.ts:107` — `source === 'extracted'` is
  trusted, so verbatim repo text merged into a conventions skill renders unwrapped in
  later prompts. Weighed in-code and gated behind a human accept; the server never
  relates the submitted body back to the accepted candidates. **Design call.**
- **WARNING** `server/src/db/migrations/0011_past_captain_flint.sql:1` — hand-written
  backfill in a generated migration. Required (`ADD CONSTRAINT` fails on orphans),
  unmerged, self-documenting. **Fix:** keep; name it in the PR description.
- **WARNING** `client/src/app/agents/_components/DeleteAgentModal/` — one consumer, so
  it belongs at `AgentCard/_components/`. (`DeleteSkillModal` at the segment rung is
  correct — it has two.)
- **WARNING** `client/src/app/skills/[id]/page.tsx:23` — the page is not a shell; it owns
  the rail, tabs and layout. **Fix:** extract `_components/SkillEditorView/`.
- **WARNING** `client/src/lib/hooks/index.ts:6` — two new `export *` lines with zero
  callers. **Fix:** drop them.

## Noted

24 SUGGESTIONs, by theme:
- **Tests** — no `helpers.test.ts` for five new pure-helper modules; `data-testid` +
  `parentElement` traversal in `SkillsTab.test.tsx`; DOM-walk + inline-style assertion
  in `ConventionCard.test.tsx`.
- **Contracts** — `repo-intel` / `polling` / `workspace` response schemas codify
  camelCase wire fields; the new `skills`/`conventions` hooks cast instead of passing a
  shared contract, so the drift guard does not cover them.
- **DB** — `convention_scans` has no index on its FK filter (needs measurement first per
  INSIGHTS); `conventions.scan_id` cascades, which would delete terminal `rejected` rows;
  `0013` lacks the `status` backfill `0011` correctly has.
- **React** — `aria-grabbed` is removed from ARIA 1.2; `SkillCard` fires an N+1
  `GET /skills/:id/agents` per tile; `VersionsTab` shares one `isPending` across rows;
  `ConfigTab`'s reset-effect would be a `key` prop.
- **Placement** — three `loading.tsx` files reach into rung-0 styles;
  `PrDetailSkeleton` owns no `styles.ts`; `USED_NAMESPACES` is a registration step the
  skill says should not exist.
- **Stale comments** — the "value import breaks `next build`" headers in the two new hook
  files are obsolete now `next.config.mjs` sets `resolve.extensionAlias`;
  `CreateSkillModal/helpers.ts:6` cites a `buildSkillDraft` that does not exist.

## Dismissed (not findings)

- `skills/helpers.ts ↔ repository.ts` depcruise cycle — the root `INSIGHTS.md` records
  this decision: the proposed fix (import `SkillRow` from `db/rows.ts`) trips
  `persistence-in-service`, 16 warnings either way, so the agents-identical shape was kept.
- `redact.test.ts`'s synthetic `ghp_…` — the fixture that proves redaction works.
- `loading.tsx` + in-page `isLoading` duplication — documented, measured decision.
- The five-file `vendor/shared` drift and the four `sql-in-routes` exemptions — accepted debt.

## Checks

| Check | Result |
|---|---|
| `pnpm exec depcruise src` | 0 errors, 16 warnings (recorded baseline) |
| `pnpm typecheck` (server / client) | pass |
| unit lanes (178 server / 111 client) | pass |
| `conventions.it.test.ts` (real Postgres) | 11 pass |
| `pnpm build` (web) | pass |
| `pnpm exec eslint .` | server 0/0 · client 0 errors, 51 warnings (was 52) |
| two-copy `vendor/shared` | pass — drift is exactly the 5 documented files |
| migration zone | pass — 0011-0014 all new, journal append-only |
| secret scan | pass (one synthetic test fixture) |
| commit subjects · stray lockfiles · e2e specs · skill frontmatter | pass |
