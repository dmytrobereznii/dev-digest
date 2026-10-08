# workflow-reviewer — references

What `scripts/report.mjs` reads, what each number means, and where it is
weak. The transcript format is not documented by Claude Code. Everything
below was read off this repo's own transcripts on 2026-10-03, written by
Claude Code 2.1.272 to 2.1.285. Recheck it when a number looks wrong after an
upgrade.

## Where transcripts live

```
~/.claude/projects/<project path, non-alphanumerics as "-">/
  <session-id>.jsonl                       main conversation
  <session-id>/subagents/agent-<id>.jsonl      one per subagent
  <session-id>/subagents/agent-<id>.meta.json  agentType, description, toolUseId, spawnDepth
  <session-id>/tool-results/                   oversized tool output
```

`CLAUDE_CONFIG_DIR` replaces `~/.claude`. `/clear` starts a new session id.
The script walks up from the working directory until a project folder
matches, so it runs from any package.

## Fields the script relies on

| Field | Used for |
| --- | --- |
| `type: assistant`, `message.id`, `message.usage`, `message.model` | Requests and tokens. One API response is written as one record per content block, each repeating the usage, so requests are keyed by `message.id` |
| `message.stop_reason` | Whether the usage is final. See "Output tokens" |
| `message.content[].tool_use` and the matching `tool_result` | Tool calls, their output size, `is_error` |
| `origin.kind` on user records: `human`, `task-notification`, `peer` | Human turns and waits, the parent's view of an agent, the hand-back text |
| `meta.json` → `toolUseId` | Links an agent to the call that spawned it. Agents spawned by one response form a wave |
| `isMeta` text starting `Base directory for this skill:` | A skill body entering context, and its size |
| `SubagentHandback` tool call | The agent's report. Older transcripts end on plain text instead |
| `type: cost-state` | Session cost in USD and per-model totals |
| `type: ai-title` | The session title in `--list` |

## The timeline

`--timeline` splits each transcript at its asks: a user record with
`origin.kind: human` in the main session, the brief or a resume message in an
agent. The calls after an ask are cut into chunks of 25 (`CHUNK`).

- **where**: calls per directory. Paths come from `file_path` and `path`
  inputs, and from path-like words in Bash commands that exist on disk now, so
  a file deleted since the run is not counted.
- **ran**: the first word or two of each Bash command.
- **said**: the agent's text in that chunk, up to four remarks. Subagents say
  little; the main session says a lot.
- **% of its input**: that ask's share of the unit's input tokens.

The labels `on-task`, `detour` and `drift` are the reviewer's judgment. The
script does not assign them.

## What each number means

- **Fresh in / Cache write / Cache read**: exact, summed over requests.
- **Hit**: cache read ÷ all input.
- **First ctx / Peak ctx**: input of the first request, and of the largest.
- **Active**: first to last record, minus waits for a human (main) or for a
  resume (subagent). Time the main session spends waiting on background
  agents counts as active.
- **Brief → report**: characters ÷ 4 of the delegation message and of the text
  handed back to the parent.
- **Output by tool, Check output, Largest tool results**: characters ÷ 4 of
  tool results. An image result counts as 0.
- **Checks**: Bash calls matching `CHECK_RE` in the script: `make test|check|
  typecheck|lint|e2e`, `vitest`, `pnpm|npm test|typecheck|lint|build`, `tsc`,
  `eslint`, `depcruise`.
- **Max parallel, waves**: from each subagent's first and last record.

## Known weak spots

- **Output tokens of subagents are estimated.** Subagent transcripts are
  written at stream start: `stop_reason` is null and `output_tokens` is a
  placeholder (2 to 20 for a full response). For those requests the script
  uses visible text and tool inputs ÷ 4 and marks the figure `~`. Thinking is
  not included, so the estimate is low. The main transcript has final usage.
- **Thinking is not stored.** Thinking blocks hold a signature and an empty
  string. The why of a step comes from the brief, the agent's own text and
  the definition it ran under.
- **The completion notice is not a cost.** `<subagent_tokens>` in a
  task-notification is the agent's final context size. In session `18b85d39`
  three researchers reported 193k between them and had processed 1.2M.
- **`cost-state` is the only dollar figure**, and it is per session: it
  ignores `--since` and is missing until Claude Code writes it. Its per-model
  totals also exceed what the transcripts hold: in session `18b85d39` it
  counted 532k Haiku input tokens against 92 on disk. The likely source is
  the small model behind WebFetch, which was not confirmed. There is no
  per-agent cost. Adding one means a price table, which goes stale.
- **Not seen in this repo's data, so untested**: agents nested deeper than one
  level, and agents spawned by the Workflow tool. The script searches the
  session folder recursively and links by `toolUseId`, which should cover
  both.

## Why it is built this way

- The brief that prompted this skill: after a pipeline run, gather tokens,
  cache reads, tool calls, duration and concurrency including nested agents,
  read the logs on disk because the parent's usage report leaves children out,
  end on specific actions, and keep a ledger for trends.
- `.context/docs/custom-agents.md` §8 asks for cost per run next to quality,
  and for reading the whole transcript, "failure modes show up in the middle".
  The timeline and the trace are that, at a size that fits in context.
- The focus account came from the first review of the skill: file-level
  detail was the wrong altitude. What finds an imprecise instruction is "asked
  for the intent layer, debugged blast radius, because its test failed".
- The approval step, the cap of three and "one run is an anecdote" follow
  `engineering-insights`: propose, write what was approved, and prefer nothing
  over noise.
- The script has no dependencies and runs on the Node the repo already
  requires, so it adds nothing to a lockfile.
