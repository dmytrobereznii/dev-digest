# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the web package but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — The client's vendored `contracts/knowledge.ts` does **not**
  export `AgentVersion`; the server's copy does. This is part of the documented
  five-file drift baseline (`diff -r client/src/vendor/shared
  server/src/vendor/shared`) and is deliberately NOT reconciled — nothing in
  the web app calls `/agents/:id/versions`. If you write a cross-copy contract
  check, exclude it, or the check fails on accepted debt rather than on a real
  regression.

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
