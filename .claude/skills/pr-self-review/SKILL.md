---
name: pr-self-review
description: >-
  Reviews the pending change against this repo's own skills and rules before a
  PR is opened, and blocks `gh pr create` / `gh pr merge` while a CRITICAL
  finding stands. Use when asked to self-review, to check changes before a PR,
  or when the pr-self-review gate has refused a `gh pr` command. Conformance
  only — correctness bugs stay with `/code-review`.
---

# pr-self-review

The last thing that runs before a PR, and the first thing that can stop it.

Every skill in this directory ends in a **Checklist** and an **Enforcement**
section, and `CLAUDE.md` carries a dozen rules no single skill owns. All of it
is read while writing code and never re-checked against the diff that came
out. This skill re-checks it.

Diff → skills map, with the exact commands:
[`routing.md`](routing.md). Report and verdict shapes:
[`template.md`](template.md). Plan of record:
[`.context/specs/03-pr-self-review-skill.md`](../../../.context/specs/03-pr-self-review-skill.md).

**Scope is conformance** — rings, rungs, naming, contracts, owned zones. Not
bugs: `/code-review` owns those. Say so and suggest it for a large diff rather
than duplicating it.

## The two halves

| Half | Does |
|---|---|
| This skill | Reviews, then writes a verdict to `.git/pr-self-review/<key>.json` |
| [`.claude/hooks/pr-self-review-gate.sh`](../../hooks/pr-self-review-gate.sh) | Refuses `gh pr create` / `merge` / `ready` unless a fresh, passing verdict exists |

The hook cannot invoke the model, so it never reviews — it checks for the
artifact and blocks with an instruction when it is missing, stale, or failing.
That split is what makes the gate deterministic.

## Step 1 — Scope the change

"Pending changes" means everything that would land in the PR, committed or not.

```sh
BASE=$(git merge-base origin/main HEAD)
git diff --name-status "$BASE"      # committed + staged + unstaged
git status --porcelain -uall        # untracked too
git diff "$BASE"                    # the hunks themselves
```

`git diff "$BASE"` takes **two dots, no `...HEAD`** — that is what includes the
working tree. Untracked files are read from disk and reviewed, and each one
also raises a `WARNING`: *untracked — will not be in the PR unless staged*.

Empty diff → say so and stop. Nothing to review is not a pass.

## Step 2 — Route

Read [`routing.md`](routing.md) and resolve the changed paths to the skills
that own them. Load **only** the routed skills; a backend-only diff never pays
for the React ones. Name them in one line before continuing:

`Routed: onion-architecture, zod, security (7 files, 2 packages).`

## Step 3 — Mechanical lane, first and short-circuiting

Run every command `routing.md` maps to a changed path. Prefer a `make` target
when two or more packages changed (`make typecheck`, `make test`); use the
package's own command when one did, per [`dev-env`](../dev-env/SKILL.md).

Severities here are **fixed** — no model judgment, nothing to argue about:

| Result | Severity |
|---|---|
| `pnpm typecheck` / `npm run typecheck` fails | `CRITICAL` |
| a unit lane fails | `CRITICAL` |
| a **new** `depcruise` error | `CRITICAL` |
| an always-on repo rule broken (`routing.md` § Always-on) | `CRITICAL` |
| a convention grep hit | `WARNING` |

`depcruise`'s baseline is **0 errors, 15 warnings**. A finding is a *new*
error, not the baseline.

**If this lane produces a `CRITICAL`, stop here.** Skip Step 4, write the
verdict, report. A failing typecheck is cheap to fix and re-run, and judgment
over a tree that is about to change is wasted.

## Step 4 — Judgment lane

One subagent per routed skill, all launched **in a single message** so they run
in parallel. Each gets exactly three things:

1. its own `SKILL.md`, plus `examples.md` where one exists,
2. **only the diff hunks under its globs** — never the whole change,
3. the instruction to report against that skill's own **Checklist** section.

Two constraints go in every subagent prompt, verbatim:

- **Known exceptions are not findings.** `onion-architecture` and
  `frontend-architecture` each carry a *"Known exceptions — accepted debt"*
  table. That debt is listed so an agent recognises it rather than
  "discovering" it. Reporting one is a wrong answer.
- **Ground every finding.** It must name a file and a line **the diff
  touches**. A finding on an untouched line is dropped, not reported — the
  same gate `reviewer-core` applies to the product's own reviews.

Findings come back in the repo's own vocabulary
([`contracts/findings.ts`](../../../server/src/vendor/shared/contracts/findings.ts)) —
see [`template.md`](template.md).

## Step 5 — Verdict

| Condition | Verdict | Effect |
|---|---|---|
| ≥ 1 `CRITICAL` | `request_changes` | the hook blocks the `gh pr` command |
| only `WARNING` / `SUGGESTION` | `comment` | passes; findings still reported |
| nothing | `approve` | passes |

`CRITICAL` is reserved for: a mechanical check that failed, an owned-zone
violation, a broken repo rule, and a skill checklist item a subagent can point
at a touched line for. **Taste is never `CRITICAL`.** When unsure between
`CRITICAL` and `WARNING`, it is a `WARNING` — the gate only keeps its
authority while every block is one the user agrees with.

## Step 6 — Write the artifacts, report, stop

```sh
mkdir -p .git/pr-self-review
# verdict JSON -> .git/pr-self-review/<key>.json   (shape: template.md)
```

`.git/` is git-ignored by construction, so a run leaves the working tree
untouched. The human report goes to the scratchpad and is printed in the reply.

The key, computed exactly as the hook computes it:

```sh
KEY="$(git rev-parse HEAD)-$( { git diff HEAD; git status --porcelain -uall; \
  git ls-files --others --exclude-standard -z \
    | while IFS= read -r -d '' f; do shasum -a 256 "$f"; done; \
  } | shasum -a 256 | cut -c1-12 )"
```

Then:

- `request_changes` → report the `CRITICAL` findings and **stop**. Do not fix.
- otherwise → *"clean — [`finalize-pr`](../finalize-pr/SKILL.md) writes the
  body."*

Done when a verdict file exists for the current key and the reply lists every
finding with its severity, file and line.

## Guardrails

- **Report, never fix.** This is a reviewer. Editing the tree it just reviewed
  invalidates the key it just wrote, and the fix is the user's call.
- **Never write the verdict by hand to unblock a `gh pr` command.** A verdict
  that did not come from a run is a lie to the gate.
- **The key changes with the tree.** Any edit after a run invalidates the
  verdict; re-run, do not re-use.
- **Fail open, never fail loud.** Outside a git repo, or with no `origin/main`,
  the gate allows the command. It guards PRs; it does not police the shell.
- **Untracked ≠ ignored.** An untracked file is in scope and gets reviewed.
- **The gate matches a command, not a substring.** `gh pr create` is
  recognised at the start of a command or after a separator, so a script or a
  test that merely quotes the phrase is not blocked. Verified both ways.
