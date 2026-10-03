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
| 2026-10-03 | R1 project-context | 2d3f587e+1283f8d4 | 20 | 4 | 53m45s | ~246.3k | 1.91M | 23.82M | 93% | 4 | $6.83 | 98% | plan-verifier `CONFORMS`, 0 Partial/Missing/Deviated, AC-74 manual and not run; 0 rework agents, 1 reviewer resumed to finish its review | 13 of 15 builder agents wrote files through the shell against their definitions, and 1 reported it | R1-A1, R1-A2, R1-A3 |

## Actions

Newest first. Status is `open`, `confirmed` or `no effect`.

- **R1-A3** `open` — `.claude/agents/test-writer.md`: the file-write rule now
  reads "no `>`, `tee`, `sed -i`, `cp`, `python3`/`node` heredoc that opens a
  file for writing, installs or other file writes. `mkdir -p` is the one
  exception." Evidence: 6 of 7 test-writers wrote files through the shell,
  mostly `python3` heredocs with `open(p,'w')`, which the rule did not name;
  one reported it. Expect: at most 1 test-writer with a shell write in the
  next run.
- **R1-A2** `open` — `.claude/agents/implementer.md`: Constraints gain "That
  includes `python3 - <<EOF` with `open(p,'w')`, `cat > file`, `cp` and
  `sed -i`: none of them may create or change a file. `mkdir -p` is the one
  exception." Evidence: 7 of 8 implementers wrote files through the shell, 3
  of them every file; none reported it. Expect: at most 1 implementer with a
  shell write in the next run.
- **R1-A1** `open` — `.claude/skills/workflow-reviewer/scripts/report.mjs:666`:
  `step.use.name` → `step.use && step.use.name`. Evidence: `--agent` threw
  `TypeError: Cannot read properties of undefined (reading 'name')` on both
  agents tried, so the reason for the shell writes stayed `unexplained`. The
  trace ran after the fix in the same session. Expect: `--agent` prints a
  trace for every agent of the next run.

Watch, from R1 (seen once, no action yet): the architecture-reviewer returned
after 6 calls with the client half of the diff unreviewed; the plan-verifier
graded 78 requirements in 9 calls and its coverage line summed to 73; a slice
whose only task is a test has no owner in `implement-spec`; the plan file was
read 11 times by 9 agents (~50k tokens); the parent took 31% of all cache
reads, woken once per agent return.
