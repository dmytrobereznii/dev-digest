# Repo-wide specs

This folder holds only specs for changes that affect **two or more packages**.
A change inside one package goes in that package's own folder:
`server/.context/specs/`, `client/.context/specs/`,
`reviewer-core/.context/specs/`, `e2e/.context/specs/` or
`mcp/.context/specs/`.

## What lives here

| File | Written by | Holds |
|---|---|---|
| `YYYY-MM-DD-feature-slug.md` | `spec-creator` | The feature spec: the what and the why, with acceptance criteria `AC-n` |
| `YYYY-MM-DD-feature-slug.plan.md` | `implementation-planner` | The plan: the how and the order, each task tied to an `AC-n` and a test |

- The date is the day the spec was created. The `Spec ID: SPEC-NN` line in
  the header is one sequence across every specs folder in the repo.
- A feature spec covers one behavioural change. A document about module
  boundaries, the stack or repo-wide invariants is architecture, and belongs
  in `docs/`.
- `Status` moves from `draft` to `approved` (by the user) to `implemented`
  (after `plan-verifier` returns `CONFORMS`).
- A spec and its plan are deleted once merged. Anything worth keeping moves to
  `.context/docs/` or `.context/insights/INSIGHTS.md` first.
- Files named `NN-kebab-slug.md` predate 2026-10-03. They carry their plan
  inside them and keep their names.

The agents and the order they run in:
[`.claude/agents/README.md`](../../.claude/agents/README.md).
