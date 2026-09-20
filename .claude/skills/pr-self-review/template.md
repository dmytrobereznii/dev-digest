# Report and verdict shapes

Two artifacts per run. Neither touches the working tree.

| Artifact | Where | Read by |
|---|---|---|
| Verdict | `.git/pr-self-review/<key>.json` | the hook |
| Report | scratchpad, `pr-self-review.md` | the user, and printed in the reply |

## A finding

Vocabulary is the product's own —
[`contracts/findings.ts`](../../../server/src/vendor/shared/contracts/findings.ts):
`Severity = CRITICAL | WARNING | SUGGESTION`,
`FindingCategory = bug | security | perf | style | test`.

```json
{
  "file": "server/src/modules/pulls/routes.ts",
  "line": 214,
  "severity": "CRITICAL",
  "category": "style",
  "rule": "onion-architecture → repository.ts is the only file importing drizzle-orm",
  "why": "The handler runs a Drizzle query inline, so the route now knows the schema.",
  "fix": "Move the query to modules/pulls/repository.ts and call it from the service."
}
```

`rule` always reads `<skill> → <checklist item>` — a finding with no rule
behind it is an opinion, and opinions are `SUGGESTION` at most.

## Verdict JSON

```json
{
  "key": "b2d64c5…-7f3a91c0de44",
  "base": "0df4d52…",
  "head": "b2d64c5…",
  "verdict": "request_changes",
  "counts": { "critical": 1, "warning": 3, "suggestion": 2 },
  "skills_run": ["onion-architecture", "zod", "security"],
  "checks_run": ["depcruise", "server:typecheck", "server:unit", "two-copy"],
  "findings": [],
  "created_at": "2026-09-20T09:12:44Z"
}
```

`verdict` is `request_changes | comment | approve`, from the same contract.
`base` is the merge-base the review covered: the hook blocks when it has moved,
because a rebase means the diff is no longer the one that was reviewed.

## Report

```markdown
# PR self-review — <branch>

**<verdict>** · <n> CRITICAL · <n> WARNING · <n> SUGGESTION
Base `<base-short>` · <n> files, <n> packages
Routed: <skill>, <skill>, <skill>

## Blocking

### CRITICAL — <rule>
`<file>:<line>`
<why, one sentence>
**Fix:** <fix, one sentence>

## Worth fixing
<WARNING rows, same shape>

## Noted
<SUGGESTION rows, one line each>

## Checks
| Check | Result |
|---|---|
| `pnpm exec depcruise src` | 0 errors (baseline) |
| `make typecheck` | pass |
| two-copy `vendor/shared` | pass |
```

Empty sections are dropped, not printed empty. A clean run is three lines and a
check table — length signals nothing.

## Closing line

| Verdict | Line |
|---|---|
| `request_changes` | "Blocked: <n> CRITICAL. `gh pr create` will be refused until these are fixed and the review re-run." |
| `comment` | "Clean to open — <n> WARNING worth a look. `finalize-pr` writes the body." |
| `approve` | "Clean. `finalize-pr` writes the body." |
