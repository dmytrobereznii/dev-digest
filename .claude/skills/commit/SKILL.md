---
name: commit
description: >-
  Writes a conventional-commit subject — one line, no body — and commits the
  change. Use when asked to commit, to stage and commit, or to land the
  current work.
---

# commit

One commit, one line. The subject **is** the message.

## Steps

1. **Read the change.** `git status --porcelain`, then `git diff HEAD`. The
   diff decides the subject, not the conversation.
2. **Stage.** Files already in the index → commit exactly those. Otherwise
   stage by path the files this session changed; an untracked file joins only
   when it is part of the same change.
3. **Write the subject** — `type(scope): summary`, per the rules below.
4. **Commit.**

   ```sh
   git commit -m "feat(reviews): add a severity filter to the findings panel" \
              -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
   ```

5. **Report** the output of `git log -1 --oneline`, then stop.

Done when `git log -1 --format=%B` shows one subject line and the trailer.

## Subject rules

- Imperative mood (`add`, `fix`, `drop`), lowercase after the colon, ≤72
  characters, no trailing period.
- Name what changed and where, specifically enough to read cold a year later:
  `fix(db): repair the migration journal`, not `fix(db): fix a bug`.
- Whatever else you would explain belongs in the code or the PR body.
- When one honest subject cannot cover the diff, make two commits.

## Type

| Type | Takes |
| --- | --- |
| `feat` | new user-visible behaviour |
| `fix` | a bug repaired |
| `refactor` | behaviour held, structure changed |
| `perf` | faster or lighter, behaviour held |
| `docs` | prose only — READMEs, `.context/`, comments |
| `test` | tests and fixtures only |
| `build` | deps, lockfiles, tsconfig, Docker |
| `ci` | `.github/`, workflows |
| `chore` | everything else |
| `revert` | undoing a prior commit |

A `!` before the colon marks a breaking change: `feat(api)!: …`.

## Scope

The area touched, in this repo's own vocabulary. Read it from history rather
than inventing one:

```sh
git log --format='%s' -40
```

Omit the scope when the change spans areas — `chore:` over a guessed scope.
