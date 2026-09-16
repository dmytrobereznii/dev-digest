# engineering-insights — references

Where this skill's design comes from, and what was taken from each source. Kept
so the next person to change the skill knows which parts are deliberate.

## The file format

- **[Self-Learning AI Skill System with Learnings.md + Wrap-Up Skill](https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up)**
  — the fixed-section file structure, the vague-vs-useful bar, the wrap-up
  trigger options and their reliability trade-off, the common mistakes
  (inconsistent wrap-up, generic entries, an over-long file, conflicting
  entries, skipping *What Doesn't Work*), the ~200-entry ceiling and the
  quarterly prune. Also the team rule this skill follows: **append-only, never
  edit someone else's entry away.**
- **[How to Build a Learnings Loop for Claude Code Skills](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)**
  — the session protocol (read at start, append at end, correct with a dated
  note rather than overwriting) and the forced-active-read idea that became the
  one-line "which file I read" sentence in Step 1.
- **[Self-Learning Claude Code Skill with Learnings.md](https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md)**
  — why plain markdown beats a vector store here: it is "a file that the
  previous session left notes in for the current one to read".

## The seven sections

The canonical structure is *What Works · What Doesn't Work · Codebase Patterns
· Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open
Questions*. This skill swaps **Session Notes for Decisions**: a dated session
diary duplicates git history — hence the gate's "`INSIGHTS.md` is not a session
diary" — while a decision plus its rejected alternative is the thing most often
re-litigated across sessions.

An earlier draft also carried a second, four-topic capture taxonomy (Decision ·
Pattern · Mistake · Gotcha), from the capture categories in
**[Self-Evolving Memory with Obsidian + Hooks](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks)**
(Patterns · Mistakes · Decisions · Context). It was dropped: it did not map onto
the seven sections, so it needed tiebreak rules to reconcile the two, and
classification is only ever needed once — at write time, against the sections.

## The approval gate

The departure from the articles, which have the wrap-up write directly. Their
own FAQ names the risk — a model can mis-summarise a session and the file
becomes confidently wrong. The propose-then-write shape (rank candidates,
present once as a multi-select, execute only what was approved) follows the
retrospective skill in
**[glebis/claude-skills](https://github.com/glebis/claude-skills)**.

## Skill authoring

- **[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)**
  — `description` is the entire discovery surface and must say both *what* and
  *when*, in third person; keep `SKILL.md` under 500 lines; keep references one
  level deep; avoid time-sensitive content.
