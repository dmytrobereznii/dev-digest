---
name: workflow-reviewer
description: >-
  Runs a retro on a finished session or multi-agent run, from the transcripts
  on disk: what was asked, what the agents actually worked on, where and why
  they left the task, what that cost, and which instruction let it happen. Use
  after a spec → plan → build pipeline run or any session that spawned
  subagents, and for "retro", "review the workflow", "what were you doing",
  "why was that run so expensive".
argument-hint: "[session-id ...] [--since 2h] [--type implementer]"
allowed-tools: Bash(node *workflow-reviewer/scripts/report.mjs*)
---

# workflow-reviewer

A **retro** on one run. Its subject is **focus**: what was asked, against what
the work actually went to. It reads like "you asked for the intent layer; 60%
of the turn went to debugging blast radius, because its integration test
failed during `make test`". Tool calls and token counts are **evidence** for
that story, never the story.

It produces a focus account per ask, at most three **actions** on the
instructions that allowed a drift, and one row in
`.context/retros/ledger.md`.

A fact about the codebase goes to `/engineering-insights`. This skill changes
how the agents are instructed.

Output formats: [`template.md`](template.md). What the numbers mean:
[`references.md`](references.md), for a number that looks wrong and for
whoever next changes the script.

## Step 1 — Scope the run

1. Pick the sessions. The default is this one, `${CLAUDE_SESSION_ID}`. A
   pipeline that wrote the spec and plan in one session and built in another
   is one run: list the sessions and pass every id.

   ```sh
   node "${CLAUDE_SKILL_DIR}/scripts/report.mjs" --list
   ```

2. If a session holds more than the run, cut it with `--since` / `--until`.
3. Read `.context/retros/ledger.md`: the last five rows and every `open`
   action.

Arguments passed to the skill: `$ARGUMENTS`

Done when you can name the sessions, and the open actions this run can
confirm or refute.

## Step 2 — Read the timeline

```sh
node "${CLAUDE_SKILL_DIR}/scripts/report.mjs" <session-id> [<session-id> ...] --timeline
```

It lists every **ask** (a human turn in the main session, the brief of an
agent) and then the work that followed, in chunks of 25 calls: the
directories touched, the commands run, the agents spawned, and what the agent
said at the time.

## Step 3 — Account for the focus

For every ask, in the main session first and then in each agent:

1. **State the focus** the ask set, in the asker's words.
2. **Name each chunk's activity** in plain words: "debugging blast radius",
   "testing Smart Diff in the browser", "re-running lint". Name the feature
   or the problem, not the tool.
3. **Label it**:
   - `on-task`: the ask needs it.
   - `detour`: off the ask, but the ask was blocked without it, such as a bug
     in feature A that stops feature B's tests.
   - `drift`: off the ask and not needed for it.
4. For every detour and drift, record:
   - **where** it began: the chunk and its time
   - **the trigger**: the agent's own words, or the error, that turned it
   - **the size**: calls, and the share of that ask's input
   - **whether it came back**, and whether the asker was told at the time
   - **the gap**: the wording in the prompt, brief, agent definition or skill
     that made it look in scope, or the missing line that would have stopped
     it. Quote it.

The timeline holds no thinking, because transcripts store none. The agent's
remarks are the only direct record of why it turned. When a turn has no
stated reason, write `unexplained` and open a trace of that agent:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/report.mjs" <session-id> --agent <id>
```

When the run happened in this session, the conversation is evidence too: a
user correction outranks anything on disk.

Done when every chunk of every ask has an activity and a label, and every
detour and drift has its five facts.

## Step 4 — Size it and record the outcome

```sh
node "${CLAUDE_SKILL_DIR}/scripts/report.mjs" <session-id> [<session-id> ...]
```

Use this report for two things only: what each detour and drift cost, and
which agents were expensive while on-task. Cost is requests × context: each
request re-reads the whole context, so an agent with 80 requests at 200k
reads 14M tokens however small each tool result was.

Then record what the run bought:

- the `plan-verifier` verdict, with its counts of Partial, Missing and Deviated
- whether the check lanes were green at the end
- rework: agents spawned to fix an earlier agent's work
- human corrections: how many, and what each corrected

## Step 5 — Turn findings into actions

Most actions come from a gap found in Step 3:

| Finding | Action |
| --- | --- |
| Drift the ask did not exclude | The brief or definition states the scope's edge: "only X; report anything else you find and stop" |
| A detour nobody was told about | The definition's output template gains a line for work done outside the brief |
| A detour that recurs across runs | The blocker is a real defect or a missing step upstream: fix it, or put it in the plan |
| A vague ask ("continue", "fix it") followed by wide work | The parent restates the focus before delegating; the brief template names the done criterion |
| An agent that kept going after its task was done | The definition's stop condition |
| Expensive while on-task: many requests at a large context | Smaller briefs, batched reads, one full check lane at the end |
| The same file re-read by many agents | Quote the needed section in the brief |

Rules for an action:

- **One run is an anecdote.** Propose an action when the drift was large, or
  the same gap shows in the ledger. Put the rest under Watch.
- **At most three actions**, and one change per agent, so the next run can
  attribute the difference.
- An action names the file, the exact wording to add or change, the evidence,
  and the **expected effect** the next retro can check.

## Step 6 — Report and record

1. Report in chat, in the format in [`template.md`](template.md).
2. Put the actions in one `AskUserQuestion` multi-select. Each option shows
   the exact change and its target file.
3. Apply the selected actions. An edit to an agent passes the checklist in
   `.context/docs/custom-agents.md` §10.
4. Write the ledger: append the run's row, add each applied action as `open`,
   and set every earlier `open` action this run tested to `confirmed` or
   `no effect`.

Report one line per file written, then stop.

## Reviewing one agent over time

To validate a single agent rather than a run, read its recent history:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/report.mjs" --last 10 --type implementer --timeline
```

Account for the focus of each run as in Step 3, then look for the gap that
repeats. This path writes actions, and no ledger row.
