# e2e — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the browser suite but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — `wait --url tab=config` is NOT enough before clicking a tab:
  every editor route renders a `Skeleton` until its TanStack Query resolves,
  and `--url` matches the moment the URL changes, so the tab row does not exist
  yet and `find role button --name <Tab>` exits non-zero. Put
  `wait --load networkidle` between them. Same root cause as the client's
  `loading.tsx` insight — nothing here fetches server-side.
  `e2e/specs/08-skills.flow.json`

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
