# workflow-reviewer — output formats

## The report, in chat

```markdown
## Retro: <run name> (<date>, sessions <id8>[+<id8>])

**Focus:** <n>% on-task · <n> detour(s) · <n> drift(s)
**Outcome:** <plan-verifier verdict and counts> · checks <green | red: lane> ·
<n> rework agent(s) · <n> human correction(s)
**Cost:** <$> · <n> agents, peak <n> parallel · main active <t>

### Asked vs did

**Turn 2: "start implementation"** (55 calls, 33% of the session)
- on-task: ran the spec's seven steps through 13 agents, one after another
- detour: fixed the "1 files" plural by hand while checking the browser
  (+1h43m, 6 calls). Trigger: "One bug: the count reads '1 files'". Came back,
  and said so at the time. Gap: none, the fix was inside the feature.

**implementer#6: "Step 6: Smart Diff view + hooks + i18n"** (116 calls)
- on-task: read the diff viewer, built the view, hooks and i18n
- drift: ran every lane one by one and then `make check`, which repeats them
  (+15m22s, 14 calls, 12% of its input). Trigger: the brief lists five checks
  and the definition says "run the `make` checks". Did not report it. Gap:
  neither says `make check` covers the rest.

### Findings

1. <claim> — <evidence: chunk, quote or number>

### Actions

| Id | Target | Change | Evidence | Expected effect |
| --- | --- | --- | --- | --- |
| R4-A1 | `.claude/agents/implementer.md` | <the wording> | <the drift it answers> | <what the next retro should see> |

### Watch

- <a gap seen once, with its evidence; not yet an action>

### Earlier actions

- R3-A2 → confirmed: <what this run showed> | no effect | not tested
```

One block per ask, main session first, then agents in start order. An ask
that stayed on-task gets one line. Leave out a section that has nothing in
it, except Outcome and Actions: write `none` there.

The on-task share is calls labelled `on-task` ÷ all calls in the run.

## The ledger

`.context/retros/ledger.md`, append-only. The script prints the row with the
measured cells filled; the last four are yours.

```markdown
| 2026-10-03 | R4 smart-diff | 3b6db235 | 19 | 2 | 2h29m | ~361k | 3.12M | 93.5M | 97% | 6 | $44.13 | 88% | CONFORMS after 2 rework agents | implementers re-ran every lane before `make check` | R4-A1 |
```

- **Run**: `R<n>` and a short name. `n` is one sequence for the whole file.
- **On-task**: the share from the report.
- **Outcome**: the Step 4 result in a few words.
- **Top finding**: the largest detour or drift, or the largest on-task cost.

An action, under `## Actions`, newest first:

```markdown
- **R4-A1** `open` — `.claude/agents/implementer.md`: "While iterating, run
  the one test file. Before reporting, run `make check` once." Evidence:
  implementer#6 ran 14 lane commands, then `make check`. Expect: at most two
  full-lane commands per implementer.
```

When a later run tests it, change the status and say what that run showed.
Keep the original text.

```markdown
- **R4-A1** `confirmed` in R5 (full-lane commands per implementer 14 → 1) — …
- **R4-A2** `no effect` in R5 — …
```
