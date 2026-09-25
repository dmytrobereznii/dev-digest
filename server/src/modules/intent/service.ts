import type { Container } from '../../platform/container.js';
import type { GitHubClient, PrIntentRecord, PrIntentResponse, UnifiedDiff } from '@devdigest/shared';
import { deriveIntent, type PromptIntent } from '@devdigest/reviewer-core';
import type { RunLogger } from '../../platform/run-logger.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentRepository, type PullRow, type RepoRow } from './repository.js';
import { isStale, prTextHash, toRecord } from './helpers.js';
import { resolveIntentSources } from './resolver.js';

/**
 * intent service (D1/D2/D9/§5.2). Orchestrates: resolve the workspace's
 * `review_intent` model, resolve references (I/O, never throws — `resolver.ts`
 * turns every per-reference failure into a `skipped` source), call
 * reviewer-core's `deriveIntent` (the ONE thing that CAN throw — a classifier
 * failure), and persist. A failed derivation writes nothing (D3): the upsert is
 * only ever reached after `deriveIntent` has already succeeded.
 */

/** Route-facing failure (D9): any error deriving intent (missing key, model
 *  error, timeout, invalid JSON after repair) maps to `502 intent_failed`. */
export class IntentFailedError extends AppError {
  constructor(message: string) {
    super('intent_failed', message, 502);
  }
}

function toPromptIntent(record: PrIntentRecord): PromptIntent {
  return {
    intent: record.intent,
    in_scope: record.in_scope,
    out_of_scope: record.out_of_scope,
    confidence: record.confidence,
  };
}

export class IntentService {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  /** `GET /pulls/:id/intent` — reads the cached row only; NEVER calls the LLM (D2/A2). */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.repo.get(prId);
    return { intent: row ? toRecord(row, pull) : null };
  }

  /**
   * `POST /pulls/:id/intent` (D2's explicit-button path). Reuses the cached
   * row when fresh unless `force`; otherwise derives with NO diff context —
   * `ensure()` is the only caller that has one already loaded (§5.2's `derive`
   * signature carries no `diff` parameter).
   */
  async derive(workspaceId: string, prId: string, opts: { force: boolean }): Promise<PrIntentRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    if (!opts.force) {
      const existing = await this.repo.get(prId);
      if (existing && !isStale(existing, pull)) return toRecord(existing, pull);
    }

    try {
      return await this.deriveNow(workspaceId, pull, repoRow);
    } catch (err) {
      throw new IntentFailedError((err as Error).message);
    }
  }

  /**
   * Shared review-step-0 pre-work (D2): one derivation serves every agent in
   * the run. Throws on failure — the CALLER (the executor's `runLog.step` +
   * try/catch, D9) decides how to log it and continues the review without the
   * slot; this method does not swallow anything itself.
   */
  async ensure(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    runLog?: RunLogger,
  ): Promise<PromptIntent> {
    const existing = await this.repo.get(pull.id);
    if (existing && !isStale(existing, pull)) {
      runLog?.info(`intent: reused (confidence ${existing.confidence})`);
      return toPromptIntent(toRecord(existing, pull));
    }
    const record = await this.deriveNow(workspaceId, pull, repoRow, diff.raw);
    const cost = record.cost_usd != null ? `$${record.cost_usd.toFixed(4)}` : 'cost n/a';
    runLog?.info(`intent: derived with ${record.model} (${record.sources.length} sources, ${cost})`);
    return toPromptIntent(record);
  }

  private async deriveNow(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diffExcerpt = '',
  ): Promise<PrIntentRecord> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider);

    let github: GitHubClient | null = null;
    try {
      github = await this.container.github();
    } catch {
      github = null; // no token configured — every issue/pull ref skips `github_unavailable`.
    }

    const [files, commits] = await Promise.all([
      this.repo.getPrFiles(pull.id),
      this.repo.getPrCommits(pull.id),
    ]);

    const { sources, docs } = await resolveIntentSources({
      repo: { owner: repoRow.owner, name: repoRow.name, prNumber: pull.number },
      prBody: pull.body ?? '',
      files: files.map((f) => ({ path: f.path, patch: f.patch })),
      clonePath: repoRow.clonePath,
      github,
      git: this.container.git,
    });

    const result = await deriveIntent({
      llm,
      model,
      title: pull.title,
      body: pull.body ?? '',
      branch: pull.branch,
      commits: commits.map((c) => ({ message: c.message })),
      files: files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
      diffExcerpt,
      docs,
      sessionId: `${repoRow.owner}/${repoRow.name}#${pull.number}:intent`,
    });

    const row = await this.repo.upsert(pull.id, {
      intentText: result.draft.intent,
      inScope: result.draft.in_scope,
      outOfScope: result.draft.out_of_scope,
      confidence: result.confidence,
      signals: result.signals,
      sources,
      model,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      headSha: pull.headSha,
      prTextHash: prTextHash(pull.title, pull.body),
    });

    return toRecord(row, pull);
  }
}
