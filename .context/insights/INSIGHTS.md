# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this repo but not visible in it.

**Append-only** — correct a stale entry with a dated note beneath it rather
than editing it away, and mark a warning as fixed rather than deleting it.

Sections are fixed. Add to the one that fits; never invent a new heading.
Newest first within each section. Format, and the bar an entry must clear:
[`engineering-insights`](../../.claude/skills/engineering-insights/SKILL.md).

## Decisions

### 2026-09-16 — Lesson features are built from scratch, never recovered from history

**What:** Every README lesson feature (L01–L08) is implemented from the
artboards in `.context/docs/design/` and a fresh spec, even though git history
holds a finished implementation of most of them. `git log -S <symbol>` surfaces
a removal commit for each — L01's run cost was stripped in `d45ab0d` — and
those commits are off-limits as a source, including as a checklist of files to
touch. Reading what the starter *currently* ships is a different thing and is
expected: `estimateCost()` and `PriceBook` are live code you find by grepping
`server/src/adapters/llm/`, and building on them is not a shortcut.

**Why:** The workshop's deliverable is the act of building the feature. A
recovered implementation produces the right diff and skips the entire exercise,
and it also skips the design decisions the lesson exists to surface.

**Rejected:** Reverting or reading the removal commit as a blueprint. It is
faster and lands a known-good diff, which is precisely why it defeats the
point — and the shortcut is tempting enough that L01 was very nearly built
that way.
**Evidence:** the live code to build on is
`server/src/adapters/llm/pricing.ts:37` (`estimateCost`) and
`server/src/platform/price-book.ts:21` (`PriceBook`); the off-limits removal is
`git show --stat d45ab0d`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
