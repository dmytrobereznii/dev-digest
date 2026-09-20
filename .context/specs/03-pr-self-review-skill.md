# 03 — `pr-self-review` skill

A local gate that reviews the pending change against **this repo's own skills**
before a PR is opened, and refuses to let a change with a `CRITICAL` finding
reach `gh pr create` / `gh pr merge`.

Plan only — no skill files are written by this spec.

## Why

The skills in `.claude/skills/` each end in a **Checklist** and an
**Enforcement** section, and `CLAUDE.md` carries a dozen repo rules (the
two-copy `vendor/shared` rule, the pnpm/npm split, the `*.it.test.ts` suffix,
the do-not-touch zones). Today all of that is read *while* writing code and
never re-checked afterwards. A PR is opened from a diff nobody re-read against
the rules it was supposed to follow.

This skill closes that loop: it is the last thing that runs before the PR and
the first thing that can stop it.

It is **not** a bug hunter. Correctness review stays with the built-in
`/code-review`; this skill reviews *conformance* — architecture rings,
placement rungs, naming, contracts, the owned zones. The two are complementary
and the skill says so rather than wrapping the other.

## Two halves

| Half | Lives in | Does |
|---|---|---|
| The skill | `.claude/skills/pr-self-review/` | Routes the diff to skills, runs the checks, writes a verdict |
| The hook | `.claude/hooks/pr-self-review-gate.sh` + `.claude/settings.json` | Refuses `gh pr create` / `gh pr merge` / `gh pr ready` unless a **fresh, passing** verdict exists |

The hook never runs the review — a hook cannot invoke the model. It checks for
the artifact the skill leaves behind and blocks with an instruction when it is
missing, stale, or failing. That split is what makes the gate deterministic.

## Invocation

- **Manual** — `/pr-self-review [base-ref]`, default base `main`.
- **Model-invoked** — no `disable-model-invocation`, so "review my changes
  before I open the PR" triggers it directly.
- **Automatic** — the hook fires on the `gh pr` command, blocks, and the block
  message tells Claude to run the skill and retry. That is the "runs
  automatically before a PR is opened" path: the gate is automatic, the review
  it demands is the same one `/pr-self-review` runs.

## Phase 0 — Scope the change

"Pending changes" means everything that would land in the PR, committed or not:

```sh
BASE=$(git merge-base origin/main HEAD)
git diff --name-status "$BASE"          # committed + staged + unstaged
git status --porcelain                  # untracked files too
```

`git diff "$BASE"` (two dots, no `...HEAD`) is deliberate — it includes the
working tree. Untracked files are read from disk and reviewed, and each one
also raises a `WARNING`: *untracked, will not be in the PR unless staged*.

The review key, recomputed identically by the hook:

```sh
KEY="$(git rev-parse HEAD)-$( { git diff "$BASE"; git status --porcelain; } \
      | shasum -a 256 | cut -c1-12 )"
```

Any edit anywhere changes the key, so a verdict can never outlive the tree it
described.

## Phase 1 — Route the diff to skills

One table, path glob → the skills that own those files. Only routed skills are
loaded; a backend-only diff never pays for the React skills.

| Changed path | Skills | Mechanical checks |
|---|---|---|
| `server/src/modules/**`, `adapters/**`, `platform/**` | `onion-architecture`, `fastify-best-practices` (on `routes.ts`), `typescript-expert` | `pnpm exec depcruise src` · `pnpm typecheck` · server unit lane |
| `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` | schema edit without a generated migration |
| `server/src/db/migrations/**` | — (owned zone) | hand edit → `CRITICAL`; `meta/_journal.json` touched alone → `CRITICAL` |
| `client/src/app/**`, `src/components/**`, `src/lib/**` | `frontend-architecture`, `react-best-practices`, `next-best-practices` | `pnpm typecheck` · `pnpm test` · the four greps in the skill's Enforcement section |
| `client/**/*.test.tsx` | `react-testing-library` | `pnpm test` |
| `*/src/vendor/shared/**` | `zod`, `onion-architecture` | `diff -r client/src/vendor/shared server/src/vendor/shared` — the two-copy rule |
| `reviewer-core/src/**` | `onion-architecture` (ring 1 engine), `zod` | `npm test` · `npm run typecheck` · no `node:*` / `fs` / network import |
| `e2e/specs/*.flow.json`, `e2e/src/**` | — | JSON parses · `NN-kebab.flow.json` · no AI `chat` command |
| settings, tokens, env reads, file writes, uploads, auth | `security` | secret/credential grep over the diff |
| `Makefile`, `scripts/**`, `docker-compose.yml`, `.github/**` | `dev-env` | `make help` still lists every target |
| `*.md`, `.context/**` | `engineering-insights`, `design-reference` | spec for merged work still present → `WARNING` |

**Always-on**, regardless of what changed — the `CLAUDE.md` rules that no
single skill owns:

- a stray lockfile from the wrong manager (`package-lock.json` under
  `server/`/`client/`, `pnpm-lock.yaml` under `reviewer-core/`/`e2e/`) →
  `CRITICAL`
- a lockfile changed with no dependency change beside it → `CRITICAL`
- anything under `server/clones/**` → `CRITICAL`
- a test importing `test/helpers/pg.ts` without the `.it.test.ts` suffix →
  `CRITICAL` (it would run in the no-Docker lane)
- naming-convention table: component folders PascalCase, server modules
  kebab-case, API JSON `snake_case`, i18n keys camelCase, specs
  `NN-kebab-slug.md`
- commit subjects on the branch match `type(area): summary`

## Phase 2 — Mechanical lane first

Every check above that is a command runs before any model judgment, through
`make` where a target exists (`make typecheck`, `make test`) and raw otherwise,
per `dev-env`. Each failure is a finding with a **fixed** severity — no model
in the loop, no argument about it.

**If the mechanical lane produces a `CRITICAL`, the skill stops there** and
does not spend the judgment lane. A failing typecheck or a new `depcruise`
error is cheap to fix and re-run, and a judgment pass over a tree that is about
to change is wasted.

`depcruise` has a known baseline — **0 errors, 15 warnings**. A finding is a
*new* error, not the baseline.

## Phase 3 — Judgment lane

One subagent per routed skill, launched in parallel in a single message. Each
gets exactly three things:

1. its own `SKILL.md` (plus `examples.md` where one exists),
2. **only the diff hunks under its globs** — not the whole change,
3. the instruction to report against that skill's own **Checklist** section.

Two hard constraints in every subagent prompt:

- **Known exceptions are not findings.** Both architecture skills carry a
  *"Known exceptions — accepted debt, 2026-09-20"* table. Pre-existing debt is
  listed there so an agent recognises it rather than "discovering" it. A
  subagent that reports one is wrong.
- **Grounding.** A finding must name a file and a line **the diff touches**.
  This mirrors the product's own grounding gate in `reviewer-core` — a finding
  on an untouched line is dropped, not reported.

Each finding comes back in the repo's own vocabulary
(`server/src/vendor/shared/contracts/findings.ts`):

```
{ file, line, severity: CRITICAL | WARNING | SUGGESTION,
  category: bug | security | perf | style | test,
  rule: "<skill> → <checklist item>", why, fix }
```

## Phase 4 — Verdict

Reusing `Verdict` from the same contract:

| Condition | Verdict | Effect |
|---|---|---|
| ≥ 1 `CRITICAL` | `request_changes` | the hook blocks the `gh pr` command |
| only `WARNING` / `SUGGESTION` | `comment` | passes; findings are reported anyway |
| nothing | `approve` | passes |

`CRITICAL` is reserved for: a mechanical check that failed, an owned-zone
violation, a broken repo rule, and a skill checklist item a subagent can point
at a touched line for. Taste is never `CRITICAL`.

On a `CRITICAL` the skill **reports and stops** — it does not fix. It is a
reviewer; the fix is the user's call, and a self-review that edits the tree it
just reviewed invalidates its own verdict key.

## Phase 5 — Artifacts

| Artifact | Where | Why there |
|---|---|---|
| Verdict | `.git/pr-self-review/<KEY>.json` | inside `.git`, so it is git-ignored by construction and never reaches a diff |
| Human report | scratchpad, `pr-self-review.md` | transient; printed in the reply |

Verdict shape: `{ key, base, head, verdict, counts: {critical, warning,
suggestion}, skills_run: [], checks_run: [], findings: [], created_at }`.

On `approve` / `comment`, the skill hands off: *"clean — `finalize-pr` writes
the body."*

## The hook

`PreToolUse` on `Bash`, matching `gh pr create`, `gh pr merge`, `gh pr ready`
in `tool_input.command` — **anchored** to the start of a command or a separator
(`;`, `&&`, `||`, `$(`), because an unanchored grep also blocks every command
that merely quotes the phrase, its own tests included. It recomputes `KEY` and:

| State | Exit | Message fed back to Claude |
|---|---|---|
| No verdict for `KEY` | 2 | "Run `/pr-self-review` first — no review for this tree." |
| Verdict is `request_changes` | 2 | the `CRITICAL` list, verbatim |
| Not a git repo / no `origin/main` | 0 | allow; the gate never breaks unrelated work |
| `approve` / `comment` | 0 | allow |

Exit 2 blocks the tool call and returns stderr to Claude as feedback, which is
what makes the block actionable rather than just fatal.

**What this gate does not do:** it cannot stop a human clicking *Merge* on
github.com. That needs a CI workflow plus branch protection, which is
explicitly out of scope here (see below). The honest claim is: *no agent in
this repo opens or merges a PR carrying a `CRITICAL`.*

## Files this spec will produce

```
.claude/skills/pr-self-review/SKILL.md        # phases, invocation, guardrails
.claude/skills/pr-self-review/routing.md      # the Phase 1 table, the only file that grows
.claude/skills/pr-self-review/template.md     # report + verdict JSON shape
.claude/hooks/pr-self-review-gate.sh          # the deterministic gate
.claude/settings.json                         # new file — the PreToolUse entry
.claude/skills/README.md                      # +1 catalog row (Scope: Process)
```

## Non-goals

- **No CI workflow, no branch protection.** Decided: local gate only.
- **No auto-fix.** Decided: report and stop.
- **No correctness review.** `/code-review` owns bugs; this skill says so and
  suggests it for a large diff instead of duplicating it.
- **No new dependency.** Everything runs on what the repo already has:
  `dependency-cruiser`, vitest, `tsc`, `git`, `grep`.
- **Nothing lands in the repo when the skill runs** — verdict in `.git/`,
  report in the scratchpad.

## Open questions

1. Does `routing.md` stay a hand-maintained table, or does the skill derive
   routing from each skill's own `description` frontmatter? Hand-maintained
   first — the descriptions are prose and the globs need to be exact.
2. Should a clean run append to `INSIGHTS.md` when a *new* class of finding
   appears? Deferred to `engineering-insights`, which already owns that loop.
