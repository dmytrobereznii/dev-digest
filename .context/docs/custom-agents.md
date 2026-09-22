# Custom Claude Code agents: authoring rules

How we write `.claude/agents/<name>.md` so each agent is worth running, in both
quality and token cost. The catalog of agents that exist is in
[`.claude/agents/README.md`](../../.claude/agents/README.md).

Researched 2026-09-22 against the live Claude Code docs, the Anthropic platform
docs, the Anthropic engineering blog and Anthropic's own agent files
([Sources](#sources)). Rules that depend on a version or a price say so; check
them again before relying on them.

**Goal:** every custom agent in this repo:

1. is picked for the right tasks, and only those;
2. starts from the fewest tokens that still do the job;
3. returns a short result the parent can act on without re-reading the repo.

**Settled decisions** (they were open questions in spec 06):

- Catalog: `.claude/agents/README.md` lists every agent, and `CLAUDE.md` →
  *Naming conventions* has a row for agent files.
- `memory` stays off. Agents *report* findings, and the parent routes them
  through `/engineering-insights` into `INSIGHTS.md`, the team's only store.
- Write-path limits (planner, test-writer, doc-writer) are enforced by the
  agent's prompt only, not by a hook.
- Agents that read or analyze get no `Write`/`Edit`. They get `Bash` only where
  their process needs it, and the body declares it read-only.

---

## 1. Should this be an agent at all?

Most ideas for an agent are really a skill, a hook, or a plain prompt. Decide
this first.

| Use | When | Why not an agent |
|---|---|---|
| **Main conversation** | Back-and-forth work; phases that share a lot of context (plan → implement → test); quick targeted edits; latency matters | A non-fork subagent starts from nothing and has to rebuild context |
| **Skill** (`.claude/skills/`) | A reusable procedure or body of knowledge that should run *inside* the current context | Skills load on demand and share the context, so nothing needs re-gathering |
| **Hook** (`.claude/settings.json`) | A rule that must hold every time (e.g. `pr-self-review-gate.sh`) | Deterministic. A model never enforces a rule reliably |
| **`/btw`** | A side question about what is already in the conversation | It sees the full context, has no tools, and adds nothing to history |
| **Fork** (`/subtask`, `context: fork`) | Side work that needs the whole conversation so far | A fork inherits the parent's history and reads the parent's cache; a fresh agent does neither |
| **Custom subagent** | Work that is **self-contained**, produces **verbose intermediate output** (test logs, broad search, doc fetches), needs **different tool limits or model**, or is the **same kind of job done repeatedly** | — this is the case this doc covers |
| **Agent teams / workflows** | Independent pieces of a large job that must coordinate or cross-check | About 7× the tokens of a normal session (teams in plan mode). Only for high-value jobs |

The test: *would the verbose middle of this task pollute the parent's context,
and can the result be summarised in about 1–2k tokens?* If not both, don't make
an agent.

## 2. Mechanics that drive the design (verified)

These platform facts shape every rule below.

- **Starting context of a non-fork subagent:** its own body as the system prompt,
  plus environment details. It does **not** get the Claude Code system prompt.
  It also gets the delegation message, the **whole CLAUDE.md hierarchy**, a git
  status snapshot, and the full text of any `skills:` it preloads.
- **What it does not get:** the conversation history, files the parent already
  read, skills the parent already invoked, the output style, and the parent's
  auto-memory. Its context window is sized by *its own* model.
- **What comes back:** only the final message. Everything else stays inside the
  agent.
- **Model order:** the per-call `model` parameter, then the frontmatter `model`
  (`inherit` means the parent's model), then `CLAUDE_CODE_SUBAGENT_MODEL`, then
  the parent's model. **If you omit `model`, a session running on Opus runs
  every subagent on Opus.**
- **Scope order:** managed, then `--agents` CLI JSON, then project
  `.claude/agents/`, then user `~/.claude/agents/`, then plugin. Edits to an
  existing file take effect on the next delegation.
- **Routing:** the `description` is the only signal the parent uses to decide
  to delegate. All custom descriptions together load into every session. Claude
  Code warns above 15,000 tokens.
- **Nesting:** the default maximum depth is 3, with up to 20 agents running at
  once. An agent whose `tools` list leaves out `Agent` can't spawn further agents.
- **Built-ins:** *Explore* and *Plan* are read-only, **skip CLAUDE.md and git
  status**, and inherit the parent's model (Explore is capped at Opus).
  *general-purpose* has every tool. Before writing a custom search agent, check
  that Explore can't already do the job.

## 3. Frontmatter standard

File: `.claude/agents/<name>.md`, with `name` in kebab-case matching the
filename. `:` is not allowed in names.

| Field | Our rule |
|---|---|
| `name` | Required. It is a role, not a persona: `test-runner`, `contract-drift-checker`. |
| `description` | Required. See §4. |
| `model` | **Always set it.** `haiku` for search, triage, log summaries and mechanical checks. `sonnet` for review and most coding. `opus` or `inherit` only for real architectural reasoning, with a reason written in the file. |
| `tools` | **Always an allowlist** for read-only or advisory agents (`Read, Grep, Glob`, plus `Bash` only if needed). Leave out `Agent` unless the agent orchestrates. |
| `disallowedTools` | Use it instead of `tools` only when the agent needs almost everything. A specifier such as `Bash(git push *)` still removes the **whole** tool, so use a hook for finer control. |
| `effort` | Set `low` for mechanical agents. Otherwise leave it unset so it inherits. Changing model or effort is a separate prompt cache. |
| `maxTurns` | Set it as a runaway guard (e.g. 15–30). A capped run comes back marked partial (v2.1.246+) and can be resumed. |
| `skills` | Preload only a skill the agent needs on **every** run, because its **full text** is injected at startup. The agent can still call other skills through the Skill tool. |
| `omitClaudeMd` | `true` only for read-only agents that get everything they need from the delegation prompt (v2.1.271+). See §7 for why it matters here. |
| `isolation: worktree` | For agents that edit files in parallel. **Gotcha:** the worktree branches from the *default branch*, not the parent's `HEAD`, so it will not see uncommitted work. |
| `permissionMode` | Leave it unset (inherits). Never commit `bypassPermissions`. |
| `memory` | Off. See *Settled decisions* above. |
| `background`, `color`, `experimental.cacheTtl`, `initialPrompt` | Not used unless a concrete need is written in the file. |

## 4. Writing the `description`

The description is the router, and it is paid for in every session. It should
say **when to use the agent**, not what the agent is.

- **Shape:** flat prose, 200–1,000 characters, 2–4 trigger scenarios:
  `Use when <condition>. Typical triggers: <a>, <b>, <c>. Not for <overlapping case> — use <other> instead.`
- Include `Use proactively` only for agents the parent should start on its own
  (e.g. after code changes). Leave it out otherwise.
- **No `<example>` transcripts** in the description. Anthropic's older plugins
  used them; the current `agent-development` guidance drops them.
- **No ALL-CAPS or "MUST".** Recent Claude models follow the system prompt
  closely and over-trigger on aggressive wording. Write `Use when …`, not
  `CRITICAL: you MUST use …`.
- Add a "Not for …" clause wherever two agents or skills could overlap.

## 5. Writing the body (the agent's system prompt)

Aim for the *smallest set of high-signal tokens*, pitched at the right altitude:
concrete heuristics rather than brittle scripted logic, and no reliance on
context the agent doesn't have. Target 300–1,000 words. Anthropic's read-only
agents run about 300–450 words and its judgment-heavy reviewers about
800–1,500. Longer only if evals show it helps.

Sections, in order:

1. **Role**, one sentence in second person: `You are a <role> for DevDigest, responsible for <outcome>.`
2. **Inputs**: what the delegation prompt must contain (paths, PR number,
   question). The agent can't see the conversation, so anything missing here
   must be asked for or looked up.
3. **Process**: numbered *how* steps that name the tools ("Grep for X, then Read
   the hits"), not "analyse the code". Say when to stop searching.
4. **Output contract**: a literal template. It must be:
   - short: state a budget (e.g. ≤ 400 words or ≤ N findings);
   - specific to location: every finding carries `path:line`;
   - classed by confidence or severity, with a stated reporting threshold
     (e.g. "report only confidence ≥ 80");
   - explicit when nothing was found (`No findings.`) instead of padded;
   - wrapped in XML tags if the parent will parse sections.
5. **Constraints / non-goals**: what the agent must not do ("advisory only — do
   not edit files"), what it leaves to others, and which repo zones it never
   touches.
6. **Edge cases**: 3–5 named situations and what to do in each.

No "When to invoke" section: the `description` has already routed the agent
by the time the body runs, so a restatement changes nothing. Leave out rules
the `tools` list already enforces (an agent without Bash cannot commit).

Positive phrasing ("do X") works better than lists of "don'ts". A few canonical
examples do more than long rule lists.

### The delegation prompt (the parent's side)

The agent is only as good as the task it receives. Every delegation, whether
Claude writes it or a skill templates it, carries four things:
**the objective, the output format, which tools or sources to use, and clear
boundaries.** Vague delegation leads to duplicated work and gaps. For parallel
fan-out, give each agent a distinct slice and scale the count to the task: one
agent for fact-finding, 2–4 for comparisons, more only for broad research.

## 6. Token-cost rules, highest impact first

1. **Don't spawn.** A single agent costs about 4× a chat, and multi-agent setups
   about 15× (Anthropic Research, June 2025; directional, not a Claude Code
   figure). Spawn only where the isolation pays for itself (§1).
2. **Set the model.** On current prices Haiku is ¼ of Opus and Sonnet is ½ of
   Opus (§ Sources). Leaving `model` unset under an Opus session is the most
   common silent overspend.
3. **Return summaries.** The agent may use tens of thousands of tokens, but it
   should hand back about 1–2k. That handoff is where the saving is made.
4. **Trim the startup context.** CLAUDE.md hierarchy + preloaded skills + tool
   schemas are paid on *every* spawn (see §7 for this repo's number). Use
   `omitClaudeMd`, narrow `tools`, and few `skills:` where safe.
5. **Keep the prompt prefix stable.** The cache matches an exact prefix (tools →
   system → messages). A subagent does **not** read the parent's cache: it warms
   its own, with a 5-minute default TTL. A static body and a fixed tool list let
   repeat runs hit the cache. Put anything that varies in the delegation
   message, not the body. Same-prefix fan-outs are staggered by up to 5 s so
   later agents can read the first one's cache write.
6. **Prefer CLI over MCP** (`gh` over a GitHub MCP server). MCP tool definitions
   are deferred by default, but each server still adds names and instructions.
   Scope `mcpServers` per agent rather than globally.
7. **Use `effort: low`** for mechanical agents. Every effort level trades tokens
   for capability.

**Measure, don't guess.** `/usage` gives session cost, but its cache line covers
the main conversation only; the plan-tier view attributes usage to subagents.
`/context` shows what is filling the window. OpenTelemetry
`claude_code.token.usage` / `claude_code.cost.usage` carry `agent.name` and
`query_source=subagent`, which is the only per-agent breakdown.

## 7. DevDigest-specific rules

- **Startup tax here is about 5k tokens.** Root `CLAUDE.md` `@`-imports
  `README.md` and `TESTING.md`, about 20 KB together, and every non-omitting
  subagent loads all three. Package `CLAUDE.md` files add more when the agent
  works in a package. For read-only lookup agents, `omitClaudeMd: true` plus
  the few rules they need, restated in the body, is cheaper.
- **Tell the agent the session protocol isn't its job.** `CLAUDE.md` tells
  every reader to read `INSIGHTS.md`, announce it, and run
  `/engineering-insights` when wrapping up. A subagent inherits those
  instructions. Every body that loads CLAUDE.md should say: *"Skip the session
  protocol's wrap-up; the parent owns `/engineering-insights`."* An agent with
  `omitClaudeMd: true` never sees the protocol, so it leaves the line out. Only agents
  whose task depends on package history should read that package's
  `INSIGHTS.md`.
- **Carry the load-bearing guardrails into any agent that omits CLAUDE.md** and
  can run Bash or edit files: no pnpm in `reviewer-core/` or `e2e/`, and no npm
  in `server/` or `client/`; the do-not-touch zones (migrations, lockfiles,
  `server/clones/**`); never `docker compose down -v`; `make` targets over raw
  commands.
- **Repeated procedures are skills first.** `pr-self-review` is correctly a
  skill plus a hook. An agent may *run* a skill's procedure in isolation
  (`skills: [pr-self-review]`), but the procedure lives in the skill, once.
- **Commits stay with the parent.** No agent commits, pushes or opens PRs. The
  user approves those in the main session.

## 8. Quality loop

1. Write the smallest version: one scenario, a tight body, and an explicit
   output template.
2. **Test on real tasks right away.** Collect about 10–20 representative
   delegation prompts from actual sessions and run each one. Read the whole
   transcript, not just the result: failure modes show up in the middle.
3. Watch for the known failures: over-spawning, endless searching, stopping
   early, duplicating a sibling's work, verbose returns, and a reviewer inventing
   findings. A reviewer asked to find gaps will usually report some, so give it
   a threshold and "what counts as a finding".
4. Record the cost per run (OTel `agent.name`) alongside the quality. An agent
   that is 5% better at 3× the cost usually loses.
5. When an agent is wrong, fix the description (routing) or the output contract
   (handoff) before adding rules to the body.

## 9. Template

```markdown
---
name: <kebab-role>
description: >-
  Use when <condition>. Typical triggers: <a>, <b>, <c>.
  Not for <overlap> — use <other> instead.
model: haiku            # haiku | sonnet — opus only with a stated reason
tools: Read, Grep, Glob # allowlist; add Bash only if the process needs it
maxTurns: 20
# omitClaudeMd: true    # read-only agents that restate the rules they need
# effort: low           # mechanical agents
---

You are the <role> for DevDigest, responsible for <outcome>.
You are a subagent: you see only this prompt and the task message, not the
parent conversation. Skip the session protocol's wrap-up; the parent owns it.
<!-- drop the wrap-up sentence when omitClaudeMd: true -->

## Inputs
The task message gives you <X>. If <Y> is missing, <look it up via … | say so and stop>.

## Process
1. <tool-level step>
2. <tool-level step>
3. Stop when <done condition>; do not <runaway behaviour>.

## Output
Return only this, at most <budget>:

<result>
<verdict>PASS | FAIL | NO_FINDINGS</verdict>
<findings>
- [<severity>] path:line — <issue> — <fix>
</findings>
</result>

Report only findings at confidence ≥ 80. If there are none, return NO_FINDINGS.

## Constraints
- Advisory only: do not edit files. <or the exact write scope>
- <repo guardrails this agent needs, if it omits CLAUDE.md>

## Edge cases
- <situation>: <what to do>
```

## 10. Review checklist, for any new or changed agent

- [ ] §1 test passes: self-contained, verbose middle, summary fits in about 2k tokens
- [ ] Not a duplicate of Explore, Plan, or an existing skill or agent
- [ ] `description` says *when*, lists 2–4 triggers and a "Not for", has no caps and no `<example>` transcripts
- [ ] `model` set explicitly, with a reason if it is `opus` or `inherit`
- [ ] `tools` is an allowlist; `Agent` is absent unless the agent orchestrates
- [ ] `maxTurns` set
- [ ] Body has role, inputs, process with a stop condition, output template with budget and threshold, and constraints; no "When to invoke" restating the description
- [ ] Body opts out of the wrap-up only if it loads CLAUDE.md; restates guardrails if `omitClaudeMd`
- [ ] Tried on at least 5 real delegation prompts; cost per run noted

## Sources

Official Claude Code docs (fetched 2026-09-22):
- Subagents: https://code.claude.com/docs/en/sub-agents (frontmatter, startup context, model order, built-ins, when to use)
- Agents overview / agent teams: https://code.claude.com/docs/en/agents · https://code.claude.com/docs/en/agent-teams (about 7× tokens in plan mode; 3–5 teammates)
- Costs: https://code.claude.com/docs/en/costs (delegate verbose operations; `model: haiku` for simple subagents; CLI over MCP)
- Prompt caching: https://code.claude.com/docs/en/prompt-caching (a subagent doesn't read the parent cache; forks do; 5 s fan-out stagger)
- Model config / effort: https://code.claude.com/docs/en/model-config
- MCP tool search: https://code.claude.com/docs/en/mcp
- Monitoring (OTel `agent.name`, `query_source`): https://code.claude.com/docs/en/monitoring-usage
- Permissions (`Agent(name)` rules): https://code.claude.com/docs/en/permissions
- Best practices (context is the constraint; adversarial reviewer caveat): https://code.claude.com/docs/en/best-practices

Anthropic platform docs:
- Prompting best practices (dial back aggressive language; tendency to over-spawn subagents): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Pricing, **as of 2026-09-22; re-check before quoting** (per MTok in/out): Haiku 4.5 $1/$5 · Sonnet 5 $2/$10 · Opus 5.5 $4/$20 · Fable 5.1 $10/$50 — https://platform.claude.com/docs/en/about-claude/pricing

Anthropic engineering blog:
- Building effective agents (2024-12-19): https://www.anthropic.com/engineering/building-effective-agents
- How we built our multi-agent research system (2025-06-13; 4× / 15× tokens; the four parts of a delegation; effort scaling): https://www.anthropic.com/engineering/multi-agent-research-system
- Writing effective tools for agents (2025-09-11): https://www.anthropic.com/engineering/writing-tools-for-agents
- Effective context engineering for AI agents (2025-09-29; right altitude; 1–2k token summaries): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Effective harnesses for long-running agents (2025-11-26): https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

Anthropic-authored exemplars:
- `anthropics/claude-plugins-official` → `plugins/plugin-dev/skills/agent-development/` (`SKILL.md`, `references/system-prompt-design.md`, `references/triggering-examples.md`; updated 2026-04-28): description shape and length, body structure
- `anthropics/claude-code` → `plugins/feature-dev/agents/` (`code-reviewer`, `code-explorer`, `code-architect`) and `plugins/pr-review-toolkit/agents/` (`comment-analyzer`, `type-design-analyzer`): tool allowlists, output templates, a confidence ≥ 80 threshold, advisory-only constraints
