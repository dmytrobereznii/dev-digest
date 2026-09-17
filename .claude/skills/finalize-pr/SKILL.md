---
name: finalize-pr
description: >-
  Writes the Ukrainian PR description that hands a lesson's homework to the
  mentors: summary, the grading table with evidence per criterion, and the
  extras. Arguments: `<lesson> [pr-number]`; the mentor's criteria table is
  pasted in the same message.
disable-model-invocation: true
---

# finalize-pr

The mentors grade from the PR page alone, row by row against their own table.
The body therefore reproduces that table **verbatim** and pins **evidence** to
every row: a link a mentor can click without cloning. Body template:
[`template.md`](template.md).

## Steps

1. **Resolve inputs.** The lesson number and the mentor's criteria table
   arrive in the message; without the table, ask for it and stop. It is never
   stored in the repo. PR from the current branch:

   ```sh
   gh pr view --json number,url,title,headRefOid,baseRefName
   ```

2. **Read the change.** Evidence comes only from commits on the branch:

   ```sh
   git log --format='%h %s' main..HEAD
   git diff --stat main..HEAD
   ```

   Then the lesson's specs (`.context/specs/`, `*/.context/specs/`) and every
   `INSIGHTS.md` entry dated during the branch. History before the branch
   point is off-limits, per the root `INSIGHTS.md` decision on lesson features.

3. **Map every criterion to evidence.** Grep for each row. Three kinds only:

   | Criterion is about | Evidence |
   | --- | --- |
   | code or a doc | permalink `https://github.com/<owner>/<repo>/blob/<headRefOid>/<path>#L<a>-L<b>` |
   | UI behaviour | permalink to the component that renders it, plus the test that drives it |
   | process (a skill firing, the phase cycle) | dated `INSIGHTS.md` entry, spec file, or commit sequence |

   Permalinks pin to `headRefOid`, never to the branch name: a later push moves
   the lines. A row with no evidence gets ⚠️ and one honest sentence; a bare ✅
   is never written.

4. **Collect the extras.** Commits that map to no criterion become «Додатково»
   bullets, each linked to its commit. Skills, Makefile targets, seed fixes,
   insights entries all count.

5. **Write the body** from `template.md` into the scratchpad as `pr-body.md`.
   Ukrainian prose; UI labels, paths, commands and repo terms stay in English,
   exactly as the mentor's table writes them (`Agent runs`, `Trace drawer`,
   `INSIGHTS.md`).

6. **Show the body and wait for a yes.** Editing the PR is outward-facing;
   this is the one gate.

7. **Publish and verify.**

   ```sh
   gh pr edit <number> --body-file <scratchpad>/pr-body.md
   gh pr view <number> --json body --jq .body | grep -c '⚠️'
   ```

   Report the PR URL and the ⚠️ count.

Done when every row of the table carries a status and a clickable pointer
and the body renders on GitHub.

## Guardrails

- The criteria table is reproduced verbatim: same numbering, same wording,
  with «Статус» and «Доказ» appended as columns. Mentors grade by their text.
- Every ✅ has a link in the same row.
- No attribution footer, no «Як перевірити локально» section: the mentors
  read the PR page only.
