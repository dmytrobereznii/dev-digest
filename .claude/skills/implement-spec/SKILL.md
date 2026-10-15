---
name: implement-spec
description: >-
  Builds one approved feature spec end to end through the project agents:
  implementation-planner writes the plan, implementer and test-writer build it
  slice by slice, the reviewers the diff calls for check it, and plan-verifier
  grades every `AC-n`. Use when asked to implement, build or finish a spec
  written by spec-creator, given as a path or `SPEC-NN`. Not for writing the
  spec (use spec-creator) or for a change that has no spec.
argument-hint: "[spec path | SPEC-NN]"
---

# implement-spec

Runs the plan → build → verify → retro steps of the pipeline in
[`.claude/agents/README.md`](../../agents/README.md) for one spec.

You are the **parent**. You spawn each agent, carry its return into the next
brief, put decisions to the user, commit, and keep the plan's books. The
agents read the code, write it, test it and review it. Your own writes are
three: the spec's `Status:` line, the plan's task boxes and Commit column, and
the commits.

Every delegation uses its brief from [`briefs.md`](briefs.md).

**The plan file is the run's state.** A ticked task box is a landed task, and
a filled Commit cell is a committed one. A run that stopped is re-entered by
invoking this skill again: it resumes at the first slice with an unticked
task.

**Rework** is one resume of an agent to fix what another agent or a lane
found. The budget is two rounds per slice and two after the verdict. A third
round means the plan or the spec is wrong, so stop and report instead.

Arguments passed to the skill: `$ARGUMENTS`

## Step 1 — Resolve the spec and open the run

1. **Find the one spec.** A path is used as given. `SPEC-NN` resolves with
   `grep -rl '^Spec ID: SPEC-NN$' .context/specs ./*/.context/specs`. With no
   argument, take the only spec whose status is `approved`; with none or
   several, list them and ask.
2. **Read it in full** and check the gate:
   - A `[NEEDS CLARIFICATION: …]` marker remains: stop, list the markers, and
     name spec-creator.
   - `Status: draft` with no marker: ask the user to approve it as written.
     On a yes, set the line to `Status: approved`.
   - No `Spec ID:` header (an older `NN-slug.md`): stop. Those carry their
     plan inside them and this skill does not run them.
3. **Record the base.** `BASE` is `git rev-parse HEAD` now. On re-entry it is
   the parent of the oldest hash in the plan's Commit column.
4. **Record the dirty files** from `git status --porcelain`. They are not
   this run's, and no commit of this run stages them.

Done when you hold one approved spec with no marker, `BASE`, and the list of
files that were already dirty.

## Step 2 — Plan

A plan is `<spec name>.plan.md` beside the spec.

- `Status: ready`: reuse it.
- `Status: draft`: put its open question to the user, then have
  implementation-planner finish it.
- None: spawn `implementation-planner`.

| Planner returns | Next |
|---|---|
| `WRITTEN` | Continue. Its `[recommendation]` feedback goes into the Step 3 summary |
| `BLOCKED` | [Route the return](#routing-a-return-that-is-not-a-success), then resume the planner with the answer |
| `DECLINED` | Stop. The change needs no plan: tell the user it is a direct edit |

Done when the plan is `ready` and the planner's `<coverage>` shows every
`AC-n` and `NFR-n` with a task and a test.

## Step 3 — One gate before the build

Show the planner's `<summary>`, `<decisions>`, the slice list and any
recommendation it had for the spec. Then ask both questions in one
`AskUserQuestion`:

1. **Execution**: in order (one slice at a time) or in parallel (the plan's
   §5 groups). Put the planner's recommendation first.
2. **Commits**: commit after each landed slice, or leave everything in the
   working tree.

If this session also wrote the spec or the plan, say above the questions that
the build can start from a fresh session instead, with
`/implement-spec <spec path>`: the plan file is the run's state, and every
agent return re-reads the parent's whole context.

This is the only planned stop. After it, stop again only for a routed
decision or a spent rework budget.

## Step 4 — Build, slice by slice

Follow the plan's §5 order. In parallel mode each §5 group is one wave:
spawn its implementers in one message. The slices of a wave share this
working tree, because `isolation: worktree` branches from the default branch
and would not hold the earlier slices. That is why their briefs carry the
parallel clause, and why you run `make typecheck lint lint-arch test`
yourself once the wave's agents are back.

For each slice:

1. Spawn `implementer` with the slice brief. Keep its agent id. A task whose
   only output is a test file or an e2e flow has no implementer step: leave
   it out of the implementer's brief and give it to `test-writer` with the
   slice's tests. A task whose only output is prose under a `.context/`
   directory goes to `implementer`.
2. On `DONE`, spawn `test-writer` for the tests the slice's task lines name
   and that do not exist yet. A slice with none skips this.
3. Read the returns:

   | Return | Next |
   |---|---|
   | test-writer `GREEN` | Land the slice |
   | `RED_SOURCE_BUG`, or a `<needs_source_change>` | Rework: resume that implementer with the items, then resume the test-writer to re-run |
   | A lane you ran is red | Rework: resume the implementer whose file the first error names |
   | implementer `BLOCKED` or `PARTIAL`, test-writer `BLOCKED` or `PARTIAL` | [Route the return](#routing-a-return-that-is-not-a-success) |

4. **Land the slice.** Tick its task boxes in the plan. With commits
   approved:
   - Stage by path: the files both returns list, plus the by-products of
     their owning tools (a generated migration and `meta/_journal.json`, a
     lockfile beside a dependency change).
   - Commit through the `commit` skill, one commit per slice.
   - Write `git log -1 --format=%h` into the Commit cell of every `AC-n` and
     `NFR-n` row the slice's tasks cite.

   A changed file that no return names stays unstaged and goes in the final
   report.

Hold every `<deviations>`, `<notes>` and `<insight_candidates>` you receive:
Step 7 and Step 8 need them.

Done when every task box in the plan's §3 is ticked.

## Step 5 — Check the whole tree

Run `make check 2>&1 | tail -40` once. It adds the two lanes the slices did
not run, `test-it` and `build-web`.

- Red: rework with the implementer whose file the first error names, then run
  it again.
- A lane that skipped itself (no Docker, or `make dev` holding :3000) is
  `SKIPPED`, and the final report says so.

Done when `make check` exits 0 and you have listed the lanes that skipped.

## Step 6 — Review what the diff calls for

Read `git diff --name-status "$BASE"` and spawn every reviewer whose row
matches, all in one message:

| The run produced | Agent |
|---|---|
| A file added, renamed or deleted under `server/src/{modules,adapters,platform,db}/**`, `reviewer-core/src/**`, either `vendor/shared/**` or `client/src/{components,lib}/**`; or a plan decision that adds a port, an adapter or a module | `architecture-reviewer` |
| A spec whose **Untrusted inputs** section names an input; or a change to `server/src/modules/*/routes.ts`, `server/src/modules/settings/**`, `server/src/adapters/**`, `reviewer-core/src/prompt*`, `mcp/**`, or a client component that renders PR or model text | `security-reviewer` |

Say in one line which ran and why, including when none did:
`Reviewers: security-reviewer (AC-6 renders PR titles). Architecture: no new files in a ring.`

- `BLOCKING` from architecture-reviewer, or `BLOCK` from security-reviewer:
  one rework round with the implementer that owns the path, then resume the
  reviewer to re-check those findings only.
- Every other finding goes in the final report. It is the user's call.
- A finding that disputes a plan decision `Dn` or an `AC-n` is a decision,
  not a fix: [route it](#routing-a-return-that-is-not-a-success).

Then, only when a task in the plan names a file under `docs/**`, spawn
`doc-writer` with the changed paths.

Commit what this step changed as its own commit, if commits are approved, and
run `make check` again if any source changed.

## Step 7 — Verify against the spec

Spawn `plan-verifier` with the verify brief: the spec path, `BASE`, the
`make check` result and the deviations you held.

| Verdict | Next |
|---|---|
| `CONFORMS` | Set the spec to `Status: implemented` |
| `GAPS` | Rework each Missing or Partial row: a source gap to `implementer`, a test gap to `test-writer`, each brief quoting the row. Run `make check`, then resume the verifier on those IDs only |
| `BLOCKED` | Supply what it names and resume it |

A **Deviated** row is a question before it is a gap. Where an implementer's
`<deviations>` line explains it, the plan is the stale side: resume
`implementation-planner` to amend that `Dn`, then re-verify the row. Where
nothing explains it, rework it like a Missing row.

`<spec_issues>` and `<unplanned>` are never fixed in code. They go to the
user in the final report: spec-creator and implementation-planner own the
edits, and an unplanned change is the user's to keep or drop.

Done when the verdict is `CONFORMS`, or the rework budget is spent and every
open row is listed for the user.

## Step 8 — Close the run

1. With commits approved, commit the spec and the plan with their final
   status, boxes and Commit cells.
2. Report:

   ```markdown
   ## SPEC-NN <feature name>: CONFORMS | GAPS (<n> open)

   **Coverage:** <the verifier's coverage line>
   **Checks:** `make check` PASS · skipped: <lane (reason)> | none
   **Run:** <n> agents · <n> rework rounds · in order | in parallel

   | Slice | Tasks | Commit | Rework |
   |---|---|---|---|
   | 3.1 Contracts | T1–T3 | a1b2c3d | 0 |

   **Yours to decide:** <open verifier rows · reviewer findings that were not
   fixed · unplanned changes · spec issues · deviations · unstaged files> | none
   ```

3. Run the retro with the `workflow-reviewer` skill, then
   `engineering-insights` with the candidates you held.

The PR path, `pr-self-review` then `finalize-pr`, starts on the user's ask.

## Routing a return that is not a success

A `BLOCKED` or `PARTIAL` return is a decision that belongs to someone else.
Find the owner, get the answer, and **resume the blocked agent** with it
through `SendMessage`, so it keeps the context it built. After re-entry in a
new session the agent ids are gone: spawn a fresh agent whose brief names
only the open items.

| The return needs | Owner |
|---|---|
| A change to what the user sees, a criterion, scope or a non-goal | The user decides through `AskUserQuestion`, with the agent's proposed wording as the first option. Then `spec-creator` edits the spec, and the planner is resumed to re-plan the tasks it touches |
| A change to the how: a contract shape, a new table, module or dependency, a task that cannot be built as written | `implementation-planner`, resumed with the blocker. It amends the plan |
| A pick between viable directions | `brainstormer`, then resume the agent with the pick |
| A fact about a library or the running system | `researcher`, then resume the agent with the finding |
| A failure outside this run's diff | The user. Report it and carry on with the slices it does not block |
| Two or three failed attempts at the same error | The user. That slice stops; slices that do not depend on it continue |

A plan edited mid-run keeps its ticked boxes. Slices already landed are
rebuilt only where the planner says the change reaches them.
