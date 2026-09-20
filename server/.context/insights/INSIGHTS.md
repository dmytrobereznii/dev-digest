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

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-20** — A `dependency-cruiser` rule whose `to.path` anchors on the
  package name (`^openai`, `^node_modules/drizzle-orm`) silently matches
  nothing under pnpm: the resolved path is
  `node_modules/.pnpm/openai@4.104.0_zod@3.25.76/node_modules/openai/index.js`.
  The rule reports zero violations and looks green. Write `node_modules/openai`
  with no `^`, and validate every new rule by planting a temporary violation.
  `server/.dependency-cruiser.cjs`

## Open Questions
