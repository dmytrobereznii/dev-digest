import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';
import { Provider } from './knowledge.js';

/**
 * Eval pipeline contracts (L06): eval cases made from decided findings, runs
 * of an agent's current config over its case set, and the read models behind
 * the Evals tab, the agent view and the all-agents dashboard.
 *
 * This file is byte-identical in both vendored copies of `@devdigest/shared`.
 */

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** What a case expects: a finding on this file and line range, or none. */
export const EvalExpectation = z.object({
  type: EvalExpectationType,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  // Display only; scoring never reads them.
  title: z.string(),
  severity: Severity,
  category: FindingCategory,
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** A surviving finding of an agent's execution on one case. */
export const EvalRunFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  category: FindingCategory,
});
export type EvalRunFinding = z.infer<typeof EvalRunFinding>;

/** The outcome of one case within one run. `case_id`/`case_name` outlive the case. */
export const EvalCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string(),
  expectation_type: EvalExpectationType,
  pass: z.boolean(),
  matched: z.number().int(),
  unjudged: z.number().int(),
  kept: z.number().int(),
  dropped: z.number().int(),
  findings: z.array(EvalRunFinding),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  /** Null once the finding is gone. */
  finding_id: z.string().nullable(),
  input_diff: z.string(),
  input_meta: z.object({
    pr_title: z.string(),
    pr_description: z.string().nullable(),
  }),
  expected_output: EvalExpectation,
  created_at: z.string(),
  last_result: EvalCaseResult.nullable(),
});
export type EvalCase = z.infer<typeof EvalCase>;

export const EvalRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

const Metric = z.number().min(0).max(1).nullable();

/** One execution of an agent's config over its case set. */
export const EvalRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  status: EvalRunStatus,
  ran_at: z.string(),
  /** Null while the run is `running` and on a `failed` run. */
  duration_ms: z.number().int().nullable(),
  agent_version: z.number().int(),
  system_prompt: z.string(),
  model: z.string(),
  provider: Provider,
  recall: Metric,
  precision: Metric,
  citation_accuracy: Metric,
  /** Null while the run is `running` and on a `failed` run. */
  traces_passed: z.number().int().nullable(),
  /** The size of the case set when the run was created. */
  traces_total: z.number().int(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalRun = z.infer<typeof EvalRun>;

/** A run without the (large) prompt, for lists and polling. */
export const EvalRunSummary = EvalRun.omit({ system_prompt: true });
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;

export const EvalRunDetail = EvalRun.extend({
  results: z.array(EvalCaseResult),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

/** One completed run on the metric trend. */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  agent_version: z.number().int(),
  recall: Metric,
  precision: Metric,
  citation_accuracy: Metric,
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Everything the Evals tab and the agent view read, in one payload. */
export const AgentEvalOverview = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    model: z.string(),
    provider: Provider,
    version: z.number().int(),
  }),
  cases: z.array(EvalCase),
  cases_total: z.number().int(),
  /** The 20 newest runs, any status, newest first. */
  runs: z.array(EvalRunSummary),
  runs_total: z.number().int(),
  /** The 20 newest completed runs, oldest first. */
  trend: z.array(EvalTrendPoint),
});
export type AgentEvalOverview = z.infer<typeof AgentEvalOverview>;

export const EvalDashboardAgent = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  version: z.number().int(),
  cases_total: z.number().int(),
  latest_run: EvalRunSummary.nullable(),
  /** Up to 8 recall points of completed runs, oldest first; nulls kept. */
  recall_trend: z.array(z.number().min(0).max(1).nullable()),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

export const EvalDashboard = z.object({
  agents: z.array(EvalDashboardAgent),
  /** The 10 newest runs across agents, newest first. */
  recent_runs: z.array(EvalRunSummary.extend({ agent_name: z.string() })),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

/** Request body of `POST /findings/:id/eval-case`. */
export const CreateEvalCaseRequest = z.object({
  finding_id: z.string(),
});
export type CreateEvalCaseRequest = z.infer<typeof CreateEvalCaseRequest>;
