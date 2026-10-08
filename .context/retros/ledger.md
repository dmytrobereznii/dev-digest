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
| 2026-10-03 | R2 pr-brief | d373a006 | 18 | 5 | 1h13m | ~307.6k | 2.58M | 49.36M | 95% | 8 | n/a | 93% | plan-verifier `CONFORMS`, 104 Met, 0 Partial/Missing/Deviated, 5 Unverifiable; `build-web` skipped; 1 rework agent and 4 rework resumes; 0 human corrections | the verifier graded 109 requirements in 11 calls and the architecture review returned `NO_FINDINGS` in 5 calls without checking the client, both for the second run | R2-A1, R2-A2, R2-A3 |

## Actions

Newest first. Status is `open`, `confirmed` or `no effect`.

- **R2-A3** `open` — `.claude/skills/implement-spec/SKILL.md`: Step 4 item 1
  gains "A task whose only output is a test file or an e2e flow has no
  implementer step: leave it out of the implementer's brief and give it to
  `test-writer` with the slice's tests. A task whose only output is prose
  under a `.context/` directory goes to `implementer`." Evidence: T4 and T22
  were tests only, T27 a flow and T28 a doc; two implementers reported them
  as deviations ("T4 therefore has no code from me") and the parent split
  slice F by hand. On R1's watch list. Expect: no implementer deviation of
  that form in the next run.
- **R2-A2** `open` — `.claude/agents/plan-verifier.md`: Output gains
  "Collapsing shortens the report, never the check: every ID gets step 4
  before it is counted. End `<coverage>` with `checked: N by reading code or
  running a test · M from the plan's table only`, and count an ID as Met only
  when it is in N. In `<matrix>` the Commit cell is a hash or `working tree`,
  never `not mapped`." Evidence: 109 requirements graded in 11 calls and
  1m14s; "the Met rows below are samples, not all 104"; "commits not mapped"
  with a hash on every row of the plan; NFR-9 Unverifiable after the parent
  gave the passing e2e result. R1 saw 78 requirements in 9 calls. Expect: a
  `checked:` split with M at 0, and a hash on every matrix row.
- **R2-A1** `open` — `.claude/agents/architecture-reviewer.md`: step 5's
  client bullet gains "When the diff touches `client/src/**`, run every grep
  in `enforcement.md` and give each one's hit count in `<mechanical>`", and a
  new bullet "A package in the diff whose rules you did not read or whose
  checks you did not run makes the verdict `CONCERNS`, with the finding
  `not reviewed: <package>`." Evidence: `NO_FINDINGS` after 5 Bash calls in
  24 seconds; the scope line claimed "skills read: onion-architecture,
  frontend-architecture" while the trace shows no skill loaded and no file
  read; "I did not run the enforcement.md greps". R1 saw the client half
  unreviewed after 6 calls. Expect: the next review lists the client greps
  with counts, or returns `CONCERNS` naming the package.
- **R1-A3** `no effect` in R2 (test-writers with a shell write 6 of 7 → 4 of
  6, by `cat >`, `cat >>` and `perl -pi`; two reported it) — `.claude/agents/test-writer.md`: the file-write rule now
  reads "no `>`, `tee`, `sed -i`, `cp`, `python3`/`node` heredoc that opens a
  file for writing, installs or other file writes. `mkdir -p` is the one
  exception." Evidence: 6 of 7 test-writers wrote files through the shell,
  mostly `python3` heredocs with `open(p,'w')`, which the rule did not name;
  one reported it. Expect: at most 1 test-writer with a shell write in the
  next run.
- **R1-A2** `confirmed` in R2 (implementers with a shell write 7 of 8 → 2 of
  7, by `cat >` and `sed -i`; the target of at most 1 was missed by one, and
  neither reported it) — `.claude/agents/implementer.md`: Constraints gain "That
  includes `python3 - <<EOF` with `open(p,'w')`, `cat > file`, `cp` and
  `sed -i`: none of them may create or change a file. `mkdir -p` is the one
  exception." Evidence: 7 of 8 implementers wrote files through the shell, 3
  of them every file; none reported it. Expect: at most 1 implementer with a
  shell write in the next run.
- **R1-A1** `confirmed` in R2 (`--agent` printed a trace for the agent
  tried) — `.claude/skills/workflow-reviewer/scripts/report.mjs:666`:
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

Watch, from R2: the planner was resumed three times for small plan edits at a
370–400k context and took 30% of the run's cache reads; the parent took 34%
of all cache reads (31% in R1); the plan file was read 20 times by 8 agents
(~40k tokens); spec-creator quoted design-fixture text into three criteria
without checking it against the seeded patches, which cost two spec rounds
and two planner resumes; the prose rule against shell writes has not held for
test-writers across two runs, so the next lever is a hook, to be checked
against the Claude Code docs first; a 14th e2e flow crossed the API's global
rate limit (fixed in the run by `API_RATE_LIMIT_MAX`).
