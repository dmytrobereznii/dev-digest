import type { AgentEvalOverview, EvalCase, Provider } from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EVAL_ERROR } from './constants.js';
import {
  caseNameFromTitle,
  expectationFromFinding,
  findingForGrounding,
  fragmentForFile,
} from './helpers.js';

export interface EvalServiceDeps {
  repo: Container['evalRepo'];
  agents: Container['agentsRepo'];
  reviews: Container['reviewRepo'];
}

/**
 * Eval service. Case creation turns a decided finding into a frozen case;
 * the overview reads an agent's cases. Takes the ports it uses, not the
 * Container.
 */
export class EvalService {
  private repo: EvalServiceDeps['repo'];
  private agents: EvalServiceDeps['agents'];
  private reviews: EvalServiceDeps['reviews'];

  constructor(deps: EvalServiceDeps) {
    this.repo = deps.repo;
    this.agents = deps.agents;
    this.reviews = deps.reviews;
  }

  /**
   * Checks run in a fixed order; the first failure wins. Idempotent: a finding
   * that already has a case returns it (`created: false`).
   */
  async createCase(
    workspaceId: string,
    findingId: string,
  ): Promise<{ case: EvalCase; created: boolean }> {
    const ctx = await this.reviews.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    const existing = await this.repo.getCaseByFinding(workspaceId, findingId);
    if (existing) return { case: existing, created: false };

    const decision = finding.acceptedAt ? 'accepted' : finding.dismissedAt ? 'dismissed' : null;
    if (!decision) {
      throw new AppError(
        EVAL_ERROR.findingUndecided,
        'Accept or dismiss this finding before turning it into an eval case',
        409,
      );
    }
    if (!review.agentId) {
      throw new AppError(
        EVAL_ERROR.findingAgentMissing,
        'The agent that produced this finding no longer exists',
        409,
      );
    }

    const files = await this.reviews.getPrFiles(pull.id);
    const file = files.find((f) => f.path === finding.file && f.patch);
    if (!file?.patch) {
      throw new AppError(
        EVAL_ERROR.diffUnavailable,
        `No stored diff for ${finding.file}`,
        409,
      );
    }

    const fragment = fragmentForFile(file.path, file.patch);
    const { kept } = groundFindings([findingForGrounding(finding)], parseUnifiedDiff(fragment));
    if (kept.length === 0) {
      throw new AppError(
        EVAL_ERROR.findingOutsideStoredDiff,
        'The finding does not fall inside the stored diff',
        409,
      );
    }

    return this.repo.insertCaseIfAbsent({
      workspaceId,
      agentId: review.agentId,
      name: caseNameFromTitle(finding.title),
      findingId,
      expectation: expectationFromFinding(finding, decision),
      inputDiff: fragment,
      prTitle: pull.title,
      prDescription: pull.body ?? null,
    });
  }

  /** The agent, its cases with last results. Runs and trend arrive with slice D. */
  async overview(workspaceId: string, agentId: string): Promise<AgentEvalOverview> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cases = await this.repo.listCasesByAgent(workspaceId, agentId);
    return {
      agent: {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        provider: agent.provider as Provider,
        version: agent.version,
      },
      cases,
      cases_total: cases.length,
      runs: [],
      runs_total: 0,
      trend: [],
    };
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const outcome = await this.repo.deleteCaseUnlessRunning(workspaceId, caseId);
    if (outcome === 'not_found') throw new NotFoundError('Eval case not found');
    if (outcome === 'run_in_progress') {
      throw new AppError(
        EVAL_ERROR.runInProgress,
        'An eval run is in progress for this agent',
        409,
      );
    }
  }
}
