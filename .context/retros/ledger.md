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
| 2026-10-10 | R3 eval-pipeline | 8f5eda96 | 31 | 6 | 1h42m | ~418.3k | 3.58M | 64.66M | 95% | 10 | n/a | 96% | plan-verifier `GAPS`, 135 Met, 0 Partial/Missing/Deviated, 3 Unverifiable (the e2e flows: the automation browser on this host cannot reach the API port); `make check` green, `build-web` skipped; after the retro the parent traced it to an IPv4-only API bind, fixed `scripts/e2e.sh`, and `make e2e` passed 17/17 and `make check` passed with `build-web`; 0 rework agents, 3 rework resumes; 0 human corrections | a test-writer ran the 6-minute `make e2e` three times on a lane that was red outside its diff, then debugged the browser: 29m52s, the run's long pole | R3-A1, R3-A2 |

## Actions

Newest first. Status is `open`, `confirmed` or `no effect`.

- **R3-A2** `open` — `.claude/skills/implement-spec/SKILL.md`: Step 3 gains
  "If this session also wrote the spec or the plan, say above the questions
  that the build can start from a fresh session instead, with
  `/implement-spec <spec path>`: the plan file is the run's state, and every
  agent return re-reads the parent's whole context." Evidence: the parent
  took 30.26M of 64.24M cache reads (47%; 31% in R1, 34% in R2) over 106
  requests, entering the build with the recon, the spec and the plan already
  in context and peaking at 425k. Expect: a build started from a fresh
  session keeps the parent under 35% of cache reads and under 250k at peak.
- **R3-A1** `open` — `.claude/agents/test-writer.md`: Edge cases gains "A lane
  is red on tests that predate your change, in the same way as on yours: it
  is broken outside your diff. Re-run it once at most, make one direct check
  of the cause, and return `PARTIAL` with that evidence. `make e2e` takes
  about 6 minutes, so never run it a third time on the same failure."
  Evidence: test-writer#12 had its three flows written at +0m35s, then ran
  `make e2e` at +0m35s, +6m42s and +19m03s (2/17 each time, flows 01–14 red
  like its own) and debugged the browser with patched copies of `e2e.sh`
  until +29m52s, leaving `scripts/.dbg-e2e.sh` behind. The brief said "the
  result to aim for is 17 of 17" and gave no stop. Expect: a test-writer that
  meets a lane red outside its diff returns after at most two runs of it.
- **R2-A3** `confirmed` in R3 (no implementer reported a test-only task as a deviation; the flows went to a test-writer and the seed-contract prose to the implementer) — `.claude/skills/implement-spec/SKILL.md`: Step 4 item 1
  gains "A task whose only output is a test file or an e2e flow has no
  implementer step: leave it out of the implementer's brief and give it to
  `test-writer` with the slice's tests. A task whose only output is prose
  under a `.context/` directory goes to `implementer`." Evidence: T4 and T22
  were tests only, T27 a flow and T28 a doc; two implementers reported them
  as deviations ("T4 therefore has no code from me") and the parent split
  slice F by hand. On R1's watch list. Expect: no implementer deviation of
  that form in the next run.
- **R2-A2** `confirmed` in R3 (138 requirements in 22 calls; `checked: 135 by reading code or running a test · 3 from the plan's table only`, the 3 being flows that could not run; every matrix row has a hash or `working tree`) — `.claude/agents/plan-verifier.md`: Output gains
  "Collapsing shortens the report, never the check: every ID gets step 4
  before it is counted. End `<coverage>` with `checked: N by reading code or
  running a test · M from the plan's table only`, and count an ID as Met only
  when it is in N. In `<matrix>` the Commit cell is a hash or `working tree`,
  never `not mapped`." Evidence: 109 requirements graded in 11 calls and
  1m14s; "the Met rows below are samples, not all 104"; "commits not mapped"
  with a hash on every row of the plan; NFR-9 Unverifiable after the parent
  gave the passing e2e result. R1 saw 78 requirements in 9 calls. Expect: a
  `checked:` split with M at 0, and a hash on every matrix row.
- **R2-A1** `confirmed` in R3 (11 calls; `<mechanical>` lists each client grep with its count, and both skills were read) — `.claude/agents/architecture-reviewer.md`: step 5's
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

Watch, from R3: two of three rework resumes were type errors in new test
files that their test-writers reported `GREEN` (one filtered `tsc` output to
its own paths, one assumed tests are not typechecked; files under
`server/src/**` and all client tests are); the shell-write rule failed for a
third run (at least 5 of 12 test-writers and 2 of 11 implementers, two
unreported; R1-A3 stays `no effect`), with no harm traced to it in any run,
so the open question is whether to enforce it with a hook or to drop it; the
plan file was read 15 times by 10 agents (~90k tokens); spec-creator ran
40 minutes over three passes and 57 edits for a 129-criterion spec, and said
itself that it was large for one spec; every agent return wakes the parent
twice, once for the hand-back and once for the task notification; a test
that failed three times while a neighbouring slice edited the hooks file and
then passed unchanged cost its test-writer about 10 re-runs.
