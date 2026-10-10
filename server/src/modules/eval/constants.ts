/** Name given to a case whose finding title has no letter or digit. */
export const FALLBACK_CASE_NAME = 'eval-case';

/** Stable 409 codes of `POST /findings/:id/eval-case` and `DELETE /eval-cases/:id`. */
export const EVAL_ERROR = {
  findingUndecided: 'finding_undecided',
  findingAgentMissing: 'finding_agent_missing',
  diffUnavailable: 'diff_unavailable',
  findingOutsideStoredDiff: 'finding_outside_stored_diff',
  runInProgress: 'eval_run_in_progress',
} as const;
