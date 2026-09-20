# server — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the API package but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — `pull_requests.status` holds GitHub's MERGE state
  (`open` / `merged` / `closed`); the review status the PR list shows is
  DERIVED by `deriveReviewStatus` from `lastReviewedSha` vs `headSha` plus
  `updatedAt` against `STALE_DAYS`. The #482 seed writes `'needs_review'` into
  that column, which works only because the function falls through on any
  non-merged/closed value — do not copy that into a new fixture.
  `server/src/modules/pulls/status.ts:37`

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-20** — `pnpm add` in `server/` can fail with
  `ERR_PNPM_UNEXPECTED_STORE`: `server/node_modules` is linked to
  `~/Library/pnpm/store/v11` while pnpm 10.34.5 wants `v10`. The only fix is
  `cd server && pnpm install`, which **purges and relinks
  `server/node_modules`** — pnpm refuses to do it without a TTY, which is the
  guard that stops an agent doing it silently. Do not run it while anything
  else is working against that tree, and never hand-write the dependency into
  `package.json` to route around it (the lockfile may only change through its
  own manager). `client/` relinked itself on its first `pnpm add` and is fine.

- **2026-09-20** — A hand-written hunk header in a seed fixture is checked by
  nothing. The diff parser trusts `@@ -a,b +c,d @@`, and a finding anchors only
  inside `newStart … newStart + newLines - 1`. Get `newLines` wrong and seeded
  findings silently fail to anchor in the diff viewer while typecheck and the
  unit lane stay green. After every patch edit recompute from the body —
  `newLines` = context + `+` lines, `oldLines` = context + `-` lines — rather
  than trusting the header you typed.
  `server/src/db/seed-prs/types.ts`

- **2026-09-20** — A `dependency-cruiser` rule whose `to.path` anchors on the
  package name (`^openai`, `^node_modules/drizzle-orm`) silently matches
  nothing under pnpm: the resolved path is
  `node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai/index.js`.
  The rule reports zero violations and looks green. Write `node_modules/openai`
  with no `^`, and validate every new rule by planting a temporary violation.
  `server/.dependency-cruiser.cjs`

## Open Questions
