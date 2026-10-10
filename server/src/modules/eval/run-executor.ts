import type { EvalCase, Provider } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { isTrustedSource } from '../reviews/helpers.js';
import { REVIEW_STRATEGY } from '../reviews/constants.js';
import { EVAL_ERROR_MAX_CHARS, EVAL_TASK_LINE } from './constants.js';
import { scoreRun, type ScoredCaseInput } from './scoring.js';

export interface EvalExecutorDeps {
  repo: Container['evalRepo'];
  agents: Container['agentsRepo'];
  llm: Container['llm'];
}

/** What a run executes: the snapshot taken when it was created. */
export interface EvalRunJob {
  runId: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  agentId: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto' | null;
  cases: EvalCase[];
}

/**
 * Executes one eval run in the background (not awaited by the route). Cases run
 * one after another through the review engine with only the run's own config:
 * no repo map, callers, intent, project documents or memory. The first failure
 * stops the loop. Results stay in memory until every case is done, then are
 * stored with the metrics in one transaction.
 */
export class EvalRunExecutor {
  constructor(private deps: EvalExecutorDeps) {}

  async execute(job: EvalRunJob): Promise<void> {
    const start = Date.now();
    try {
      await this.run(job, start);
    } catch (err) {
      await this.deps.repo
        .failRun(job.runId, truncate((err as Error).message))
        .catch(() => undefined);
    }
  }

  private async run(job: EvalRunJob, start: number): Promise<void> {
    const { repo, agents } = this.deps;

    // Skills are resolved once, when execution starts.
    const linked = await agents.linkedSkills(job.agentId);
    const skills = linked
      .filter((l) => l.skill.enabled)
      .map((l) => ({
        name: l.skill.name,
        body: l.skill.body,
        trusted: isTrustedSource(l.skill.source),
      }));

    const scored: ScoredCaseInput[] = [];
    for (const c of job.cases) {
      const caseStart = Date.now();
      try {
        const llm: LLMProvider = await this.deps.llm(job.provider);
        const outcome = await reviewPullRequest({
          systemPrompt: job.systemPrompt,
          model: job.model,
          diff: parseUnifiedDiff(c.input_diff),
          llm,
          strategy: job.strategy ?? REVIEW_STRATEGY,
          ...(skills.length ? { skills } : {}),
          ...(c.input_meta.pr_description ? { prDescription: c.input_meta.pr_description } : {}),
          task: EVAL_TASK_LINE,
        });
        scored.push({
          case_id: c.id,
          case_name: c.name,
          expectation: c.expected_output,
          kept: outcome.review.findings,
          dropped: outcome.dropped.length,
          duration_ms: Date.now() - caseStart,
          cost_usd: outcome.costUsd,
        });
      } catch (err) {
        await repo.failRun(job.runId, truncate(`Case "${c.name}": ${(err as Error).message}`));
        return;
      }
    }

    const { results, metrics } = scoreRun(scored);
    const costs = scored.map((s) => s.cost_usd);
    await repo.completeRun(job.runId, {
      results,
      recall: metrics.recall,
      precision: metrics.precision,
      citationAccuracy: metrics.citation_accuracy,
      tracesPassed: metrics.traces_passed,
      costUsd: costs.some((x) => x === null) ? null : costs.reduce<number>((a, x) => a + (x ?? 0), 0),
      durationMs: Date.now() - start,
    });
  }
}

function truncate(message: string): string {
  return message.length > EVAL_ERROR_MAX_CHARS ? message.slice(0, EVAL_ERROR_MAX_CHARS) : message;
}
