# reviewer-core — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about the review engine but not visible in it.

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

- **2026-09-16** — A run failing with `Invalid response body while trying to
  fetch https://openrouter.ai/api/v1/chat/completions: Premature close` is
  almost always the MODEL failing to terminate, not a transport fault. Swap
  the model BEFORE debugging HTTP: `deepseek/deepseek-v4-flash` answered a
  short prompt in ~10s but hung >10min with zero bytes on the real reviewer
  system prompt, while `anthropic/claude-haiku-4.5` finished the same review
  in 21s (6 findings, 6/6 grounded). The starter seeds the former as
  `DEFAULT_MODEL` (`server/src/db/seed.ts:32`), so a fresh clone hits this.
  `reviewer-core/src/llm/openrouter.ts:69`

## Open Questions
