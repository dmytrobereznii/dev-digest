import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Assertions are on the trace.
 *
 * Budget: 5 Claude sessions (limit 6).
 *   - dispatch                     = 1
 *   - activation pair (pos + neg)  = 2
 *   - contrast (treatment+control) = 2
 */
export const cases: WorkflowCase[] = [
  // --- dispatch (1 session) ---------------------------------------------------------------------
  {
    kind: "dispatch",
    name: "architecture review request spawns the architecture-reviewer subagent",
    prompt:
      "I plan to add a new endpoint GET /reviews/:id/export in server/src/modules/reviews that " +
      "returns a review as markdown, with the query written directly inside routes.ts. Run an " +
      "architecture review of this plan against the onion rings: use the architecture-reviewer " +
      "subagent, do not review it yourself.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },

  // --- activation pair (2 sessions) -------------------------------------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a just-found bug cause",
    prompt:
      "I just found why the pgvector query returned zero rows: the column dimension did not match " +
      "after we changed the embedding model. This was non-obvious and I want to record it so " +
      "nobody trips on it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — a plain question on the same topic must NOT activate it",
    prompt:
      "In general, how do vector column dimensions work in pgvector, and what happens when the " +
      "query vector has a different length?",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- contrast (2 sessions) --------------------------------------------------------------------
  {
    kind: "contrast",
    name: "CLAUDE.md session protocol makes a server task read server INSIGHTS.md",
    prompt:
      "I am about to start working in server/ on the reviews module. Before you look at any code, " +
      "do whatever this repo's guidelines require for starting work in that package, then tell me " +
      "you are ready.",
    expectFileRead: "server/.context/insights/INSIGHTS.md",
    tools: ["Read", "Grep", "Glob"],
    maxTurns: 6,
  },
];
