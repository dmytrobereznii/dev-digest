---
name: engineering-insights
description: >-
  Reads and records DevDigest's per-package INSIGHTS.md. Read the relevant
  package's file at the START of any non-trivial task; at the END, propose what
  the session learned back into it. Triggers: "insights", "INSIGHTS.md",
  "wrap up", and the end of any session in which something non-obvious
  surfaced.
---

# engineering-insights

A loop over the `INSIGHTS.md` files: **read** at the start of a task, **record**
at the end. Insights are package-local by design — a session working in
`client/` reads `client/.context/insights/INSIGHTS.md`, not all six. Knowledge
lives next to the code it is about.

Worked examples of every entry format: [`examples.md`](examples.md).
[`references.md`](references.md) is for whoever next changes this skill.

## Step 1 — Read first

Before answering a question or touching code:

1. Resolve the package from the table below.
2. Read that `INSIGHTS.md` in full. It is capped and short — read it, don't
   grep.
3. Read the root file as well when the work spans two or more packages.
4. **Say in one line which file you read and whether it was relevant.** Example:
   `Read server/.context/insights/INSIGHTS.md — nothing on SSE.`

If a curated entry answers the question, cite it instead of re-deriving it from
code.

## Which file

| The work touches | File |
| --- | --- |
| `server/**`, including `src/modules/repo-intel/**` | `server/.context/insights/INSIGHTS.md` |
| `client/**` | `client/.context/insights/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/.context/insights/INSIGHTS.md` |
| `e2e/**`, `scripts/e2e.sh` | `e2e/.context/insights/INSIGHTS.md` |
| `mcp/**` | `mcp/.context/insights/INSIGHTS.md` |
| `scripts/`, `.github/`, `docker-compose.yml`, root docs, the pnpm/npm split, **or ≥2 packages** | `.context/insights/INSIGHTS.md` (root) |

Three routings that get misfiled:

- **`server/src/vendor/shared/**` → root.** That is `@devdigest/shared`. Root
  `CLAUDE.md` requires the `client/` copy to change with it, so a contract
  finding is never server-local.
- **`server/src/modules/repo-intel/**` → server.** It is a folder inside
  `@devdigest/api`, not a package of its own.
- **`client/src/vendor/**` → client**, and only for findings about *consuming*
  it. The vendored code itself is not ours to change.

## Step 2 — Capture as you go

While the task runs, hold candidates silently in a running list: anything that
surprised you, or that you would have wanted to know at the start. **Never
interrupt the task to write** — proposing happens once, at the end.

## Step 3 — Propose

### 3a. Gate

An entry earns its place only if reading it **cold** at the start of *this*
session would have changed how the session went. Nothing clears that on a typo,
a rename, or a feature that went exactly as expected → **write nothing, say
"nothing worth recording", stop.** Recording noise is worse than recording
nothing, and `INSIGHTS.md` is not a session diary.

### 3b. Rank and cap

If something non-obvious did happen, rank the candidates — highest signal
first:

1. **User corrections** — an explicit "no, do it this way". Highest signal
   there is; either the repo was wrong or the agent's default was.
2. **Approaches that failed** — what was tried and abandoned, and why.
3. **Repeated friction** — the same error or workaround hit more than once.
4. **Conventions discovered by reading code** — things `CLAUDE.md` doesn't say.
5. **Dependency and toolchain quirks.**

Apply the bar (below), then **cap at 3 entries per session**, even when more
candidates survive. If everything looks worth writing, the bar is being applied
too loosely.

### 3c. Ask

Present the survivors in **one `AskUserQuestion` multi-select**. Each option
shows the **exact entry text** that will be written, plus its target file and
section — enough to judge without a follow-up question. Write nothing that was
not selected.

## Step 4 — Write

For each approved entry:

1. **Read the target file** before writing to it.
2. **Check for a duplicate** —
   `grep -i '<key identifier>' <package>/.context/insights/INSIGHTS.md`. If a
   near-duplicate is there, **refine that entry** — sharpen the claim, update
   the date, add the evidence — instead of appending a near-copy.
3. **Append** under the right section, newest first within that section.
4. If an entry contradicts an existing one, do **not** leave both. Correct the
   old one and note what changed.

**Never delete.** When something an entry warns about gets fixed in code, mark
it rather than removing it, so the next reader knows the warning is historical:

```markdown
- **2026-07-31** — … original claim … **Fixed 2026-08-14 in `server/src/…`.**
```

### Report

One line per action, then stop. No trailing commentary.

```
server/.context/insights/INSIGHTS.md — added under Tool & Library Notes: …
Skipped: grounding-gate note (already covered by the 2026-07-31 entry)
```

## Which section

Sections are fixed. Add to the one that fits; **never invent a heading.**

| Section | Takes |
| --- | --- |
| `Decisions` | A choice made, with the alternative that was rejected |
| `What Works` | An approach that solved something and should be reused |
| `What Doesn't Work` | A dead end — the section most often skipped, and the most valuable |
| `Codebase Patterns` | A convention you had to discover by reading code, that `CLAUDE.md` does not state |
| `Tool & Library Notes` | A quirk of a dependency, CLI, or the toolchain |
| `Recurring Errors & Fixes` | A symptom you will hit again, and its cause |
| `Open Questions` | Something left unresolved, so the next session knows |

Two tiebreaks:

- A gotcha you would hit **once** is `Tool & Library Notes`. One you would hit
  **repeatedly**, with a recognisable symptom, is `Recurring Errors & Fixes`.
- A pattern in **our** code is `Codebase Patterns`. A pattern in **someone
  else's** is `Tool & Library Notes`.

## Entry format

`Decisions` takes prose — the rejected alternative is the part that stops the
next session relitigating the choice, and a bullet loses it:

```markdown
### 2026-09-15 — Title of the decision

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what was considered, and why it lost.
```

Every other section takes a dated bullet — claim first, evidence last:

```markdown
- **2026-09-15** — <claim, specific enough to act on cold>.
  `path/to/file.ts:42`
```

House style: hard-wrap at ~79 columns, backtick every path and identifier,
quote the **actual** error string, and end with a `path:line` or a runnable
command wherever one exists.

## The bar

An entry must be actionable **cold** — the next session reads it and knows what
to do without re-deriving anything — and must say something `CLAUDE.md`,
`README.md`, `TESTING.md` and `docs/` do not.

| ✗ Noise | ✓ Insight |
| --- | --- |
| "be careful with migrations" | "`relation … does not exist` on a fresh clone means migrations were skipped — they do not run on boot. `cd server && pnpm db:migrate`" |

If it would be obvious to anyone reading the code, don't write it. Generic
advice is the failure mode — "use async carefully" is true everywhere and
therefore useful nowhere. Write the claim, not a label: "fixed the SSE bug"
tells the next session nothing. More pairs, and one worked entry per section,
in [`examples.md`](examples.md).

## Keeping the files lean

- Roughly **5 entries per section** per file. Past that, signal drops; the
  research puts the hard ceiling at ~200 entries across the repo.
- When an entry becomes stable reference material, **promote it into
  `<package>/.context/docs/` and delete it here.** That path is what keeps these
  files short.
- Prune quarterly: drop entries about code that no longer exists, consolidate
  near-duplicates, close resolved `Open Questions`.
- An entry that no longer holds is worse than no entry. Correct it or mark it.
