# implement-spec — briefs

The task message for each delegation. An agent sees its own definition and
this message, nothing else, so every path and ID it needs is here. Fill the
`<…>` slots, drop a bracketed clause that does not apply, and add nothing: the
agent's definition already sets its process and its output shape.

Paths are repo-relative. `<BASE>` is the commit recorded in Step 1.

## implementation-planner

```
Plan SPEC-NN: <spec path>. It is approved and holds no clarification marker.
[Direction already chosen by brainstormer: <the pick, one line>.]
```

Resumed after a spec change:

```
SPEC-NN changed: <AC-n added | reworded | removed, one line each>.
Re-plan the tasks those criteria touch and keep every ticked task as it is.
```

## implementer — one slice

```
Build slice <3.n name> of <plan path>: tasks <T4–T7>.
Slices already landed: <3.1 (a1b2c3d), 3.2 (working tree)> | none.

Scope is the source for those tasks. The tests named on their task lines
belong to test-writer, which runs after you. Keep the existing tests green,
and update one only where your change makes it wrong.

[Parallel: slices <3.x, 3.y> are being built in this working tree right now,
in <their files>. Stay inside your slice's files. Run single-file checks only
and report the full lanes as SKIPPED (parallel wave); the parent runs them
when the wave is back.]

Report anything broken outside these tasks under <notes> and leave it.
```

## test-writer — one slice

The criterion is quoted because test-writer does not read the spec.

```
Write the tests that slice <3.n name> of <plan path> names, for code that
implementer has just written.

Code under test:
- <path — from the implementer's <files>>

Behaviour to pin, one test per line, named as the plan names it:
- <test file · test title> — AC-<n>: "<the criterion, quoted from the spec>"

Scope is these tests.
[Parallel: other slices are being built in this working tree right now. Run
your own files only, and leave `make test` to the parent.]
```

## Rework — a resume through SendMessage

```
Rework <1|2> of 2, slice <3.n>. Fix only these, then re-run the checks you
ran before:
- <the item verbatim, with its path:line: a source bug, a missing seam, the
  first failing lines of a lane, a reviewer finding, a verifier row>
```

After re-entry in a new session there is no agent to resume. Spawn a fresh
`implementer` or `test-writer` with the same list as inline steps, plus the
plan path and the slice.

## architecture-reviewer

```
Diff scope: `git diff <BASE>`, working tree included. It is the build of
SPEC-NN.
The structure follows the decisions in <plan path> §2. Where a finding
contradicts a decision `Dn`, name the `Dn` in the finding.
```

## security-reviewer

```
Base ref: <BASE>. Review `git diff <BASE>`, working tree included. It is the
build of SPEC-NN.
<spec path> § Untrusted inputs states the rule each input must follow. Check
that the diff holds every rule.
```

Re-check after rework, for either reviewer:

```
Re-check only these findings against the working tree: <path:line, one line
each>.
```

## doc-writer

```
Topic: <feature name> (SPEC-NN), now implemented.
Docs the plan names: <docs/… — from task T<n>>.
Changed files:
- <path>
```

## plan-verifier

```
Verify SPEC-NN: <spec path>. Its plan is beside it.
Base: <BASE>.
Whole-lane results, run by the parent: `make check` — <PASS | FAIL (lane) |
SKIPPED: lane (reason)>.
Done-list, to check rather than trust:
- deviations: <each implementer <deviations> line> | none
- fixed in rework: <item — slice> | none
You may run single test files as evidence.
```

Re-check after rework:

```
Re-check only: <AC-4, D3>. Changed since your last pass: <paths>.
`make check` — <result>.
```

## spec-creator — a change the user chose mid-run

```
Revise SPEC-NN at <spec path>.
Issue, as reported by <agent>: "<the blocking item, quoted>".
The user chose: <the answer>.
The user approved this change, so the spec stays `approved` when no marker
remains.
```

## brainstormer

```
An open choice blocks <the plan | slice 3.n> of SPEC-NN: <the question>.
Options the blocked agent named: <A | B | C>.
The constraints are in <spec path> and <plan path> §2.
```

## researcher

```
<The question, one sentence>, for <slice 3.n | the plan> of SPEC-NN.
What is already known: <the blocked agent's finding, with its path:line>.
```
