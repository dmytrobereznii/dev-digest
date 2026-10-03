# Workflow retros — ledger

One row per multi-agent run, written by the
[`workflow-reviewer`](../../.claude/skills/workflow-reviewer/SKILL.md) skill.
Read the trend, not the row: one run is an anecdote.

**Append-only.** Newest row last. Row and action formats:
[`template.md`](../../.claude/skills/workflow-reviewer/template.md). What each
column measures:
[`references.md`](../../.claude/skills/workflow-reviewer/references.md).

## Runs

| Date | Run | Sessions | Agents | Max parallel | Main active | Out | Cache write | Cache read | Hit | Tool errors | Cost | On-task | Outcome | Top finding | Actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-23 | R0 smart-diff (baseline, backfilled 2026-10-03, focus not reviewed) | 3b6db235 | 19 | 2 | 2h29m | ~361k | 3.12M | 93.5M | 97% | 6 | $44.13 | not reviewed | plan-verifier `GAPS`, 39/42 Met, 1 Partial; one fix agent after it | the spec was read 22 times by 17 agents, ~157k tokens | none |

## Actions

Newest first. Status is `open`, `confirmed` or `no effect`.
