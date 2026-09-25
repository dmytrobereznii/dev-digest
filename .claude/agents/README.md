# Agents

Custom Claude Code subagents for DevDigest. Each runs in its own context and
returns only a short summary. None of them commits, pushes or opens PRs, and
none can spawn further agents. Authoring rules:
[`.context/docs/custom-agents.md`](../../.context/docs/custom-agents.md).

## Catalog

| Agent | Does | Model | Tools | Writes | Skills reused |
|---|---|---|---|---|---|
| [researcher](researcher.md) | Answers a question from code and primary sources; cited, dated, verified vs. inferred | sonnet | Read, Grep, Glob, WebFetch, WebSearch, Bash (read-only) | nothing | reads SKILL.md of the topic's skill |
| [planner](planner.md) | Writes one implementation spec, `NN-kebab-slug.md` | opus, effort high | Read, Grep, Glob, Write, Edit, Bash (read-only), Skill, WebFetch, WebSearch | `.context/specs/`, `<pkg>/.context/specs/` | onion-architecture, frontend-architecture, design-reference, postgresql-table-design, drizzle-orm-patterns, dev-env |
| [implementer](implementer.md) | Implements a plan/spec, runs the `make` checks, reports deviations | sonnet | Read, Edit, Write, Bash, Grep, Glob, Skill | source code (no migrations, lockfiles, `server/clones/**`) | dev-env (preloaded); architecture and stack skills on demand |
| [brainstormer](brainstormer.md) | Compares options before implementation, recommends one | opus | Read, Grep, Glob, WebSearch, WebFetch, Skill | nothing | design-reference, onion-/frontend-architecture, stack skills on demand |
| [test-writer](test-writer.md) | Writes and runs tests; reports source bugs instead of fixing them | sonnet | Read, Grep, Glob, Write, Edit, Bash, Skill | test files, `server/test/helpers/**`, `e2e/specs/*.flow.json`, additive `mocks.ts` | dev-env, react-testing-library |
| [architecture-reviewer](architecture-reviewer.md) | Layer boundaries, coupling, abstraction leaks; findings ≥ 80 confidence | sonnet | Read, Grep, Glob, Bash (read-only) | nothing | onion-architecture, frontend-architecture (read directly) |
| [security-reviewer](security-reviewer.md) | Exploitable issues with severity; local-first threat model | sonnet | Read, Grep, Glob, Bash (read-only), Skill | nothing | security |
| [plan-verifier](plan-verifier.md) | Checks each requirement of the finished diff against the spec: Met / Partial / Missing / Deviated / Unverifiable / Deferred | sonnet | Read, Grep, Glob, Bash (read-only), Skill | nothing | dev-env, design-reference |
| [doc-writer](doc-writer.md) | Updates `docs/**`, Mermaid diagrams, claims cited to source | sonnet | Read, Grep, Glob, Write, Edit | `docs/**` | mermaid-diagram |

- Write scopes and "read-only" Bash are enforced by each agent's prompt, not by
  hooks or permissions.
- `omitClaudeMd: true` is set on researcher, brainstormer, architecture-reviewer,
  security-reviewer and plan-verifier; their bodies restate the guardrails they
  need. The rest load CLAUDE.md.
- Agents that load CLAUDE.md opt out of the session-protocol wrap-up; the
  parent owns `/engineering-insights`.
- Status: written 2026-09-22 and not yet tried on real delegation prompts
  (checklist in the authoring rules, §10).

## Resources

Claude Code docs (raw `.md` pages were checked for every mechanic):
[sub-agents](https://code.claude.com/docs/en/sub-agents) ·
[best practices](https://code.claude.com/docs/en/best-practices) ·
[model config / effort](https://code.claude.com/docs/en/model-config) ·
[worktrees](https://code.claude.com/docs/en/worktrees) ·
[tools reference](https://code.claude.com/docs/en/tools-reference) ·
[Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

Anthropic engineering and exemplars:
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) ·
[effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) ·
[cookbook research subagent prompt](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/prompts/research_subagent.md) ·
[feature-dev agents](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev/agents) ·
[claude-plugins-official](https://github.com/anthropics/claude-plugins-official) ·
[claude-code-security-review](https://github.com/anthropics/claude-code-security-review)

By agent:

- **planner / plan-verifier:** [GitHub Spec Kit](https://github.com/github/spec-kit) (`/analyze`),
  [Kiro correctness](https://kiro.dev/docs/specs/correctness/),
  [traceSDD](https://arxiv.org/abs/2606.30689)
- **brainstormer:** [MADR 4.0](https://adr.github.io/madr/),
  [Bezos 2015 letter (Type 1 / Type 2 decisions)](https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF),
  [Meincke et al., LLM idea diversity](https://arxiv.org/abs/2402.01727)
- **test-writer:** [Meta ACH](https://arxiv.org/abs/2501.12862),
  [Meta TestGen-LLM](https://arxiv.org/abs/2402.09171),
  [Kent C. Dodds, testing implementation details](https://kentcdodds.com/blog/testing-implementation-details)
- **architecture-reviewer:** [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html),
  [dependency-cruiser CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md),
  [BitsAI-CR](https://arxiv.org/abs/2501.15134)
- **security-reviewer:** [OWASP Top 10:2025](https://top10.owasp.org/2025),
  [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/),
  [Willison, the lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- **doc-writer:** [Diátaxis](https://diataxis.fr/),
  [Google developer docs style](https://developers.google.com/style/highlights),
  [GitHub Mermaid rendering](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)
