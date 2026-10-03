import { PrBriefStored } from '@devdigest/shared';
import type {
  BlastRadius,
  BriefMissingInput,
  Intent,
  PrBriefRecord,
  PrBriefResponse,
} from '@devdigest/shared';
import { classifyFile } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefRepository } from './repository.js';
import { changedRanges, groundBrief, isBlastAvailable, toRecord } from './helpers.js';
import { BriefOutput, buildBriefMessages } from './prompt.js';
import { BRIEF_SCHEMA_NAME, BRIEF_TIMEOUT_MS } from './constants.js';

/** Route-facing failure: anything from provider resolution to the structured call. */
export class BriefFailedError extends AppError {
  constructor(message: string) {
    super('brief_failed', message, 502);
  }
}

/**
 * brief service. `get` is a pure read (no model call, no GitHub). `generate`
 * gathers the facts that already exist (intent, blast, attached documents —
 * each missing one is noted, never fatal), makes ONE structured call, grounds
 * the output against the changed files, and only then upserts, so a failure
 * leaves the stored brief untouched.
 */
export class BriefService {
  private repo: BriefRepository;
  /** PRs with a generation in flight. One API instance per database, so memory is enough. */
  private inFlight = new Set<string>();

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const parsed = PrBriefStored.safeParse(await this.repo.get(prId));
    return {
      brief: parsed.success ? toRecord(parsed.data, pull) : null,
      generating: this.inFlight.has(prId),
    };
  }

  async generate(workspaceId: string, prId: string): Promise<PrBriefRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const rows = await this.repo.getPrFiles(prId);
    if (rows.length === 0) {
      throw new AppError('brief_no_files', 'This pull request has no changed files to brief.', 422);
    }

    // Check and add with no await between them.
    if (this.inFlight.has(prId)) {
      throw new AppError('brief_in_progress', 'A brief is already being generated for this pull request.', 409);
    }
    this.inFlight.add(prId);
    try {
      const files = rows.map((f) => ({
        path: f.path,
        role: classifyFile(f.path),
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        ranges: changedRanges(f.patch),
      }));

      const [intent, blast, docs] = await Promise.all([
        this.readIntent(workspaceId, prId),
        this.readBlast(workspaceId, prId),
        this.readDocuments(repoRow),
      ]);
      const missing: BriefMissingInput[] = [];
      if (!intent) missing.push('intent');
      if (!blast) missing.push('blast');
      if (docs.length === 0) missing.push('specs');

      const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      const messages = await buildBriefMessages({
        title: pull.title,
        description: pull.body,
        files,
        intent: intent ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope } : null,
        blast,
        documents: docs,
      });

      let result;
      try {
        const llm = await this.container.llm(provider);
        result = await llm.completeStructured({
          model,
          schema: BriefOutput,
          schemaName: BRIEF_SCHEMA_NAME,
          messages,
          timeoutMs: BRIEF_TIMEOUT_MS,
          sessionId: `${repoRow.owner}/${repoRow.name}#${pull.number}:brief`,
        });
      } catch (err) {
        throw new BriefFailedError((err as Error).message);
      }

      const grounded = groundBrief(result.data, files);
      const stored: PrBriefStored = {
        pr_id: prId,
        summary: result.data.summary,
        intent: intent ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope } : null,
        blast: blast ? pickBlast(blast) : null,
        risks: { risks: grounded.risks },
        review_focus: grounded.review_focus,
        history: { history: [] },
        head_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        missing_inputs: missing,
        specs_used: docs.map((d) => d.path),
        dropped: grounded.dropped,
      };
      await this.repo.upsert(prId, stored);
      return toRecord(stored, pull);
    } finally {
      this.inFlight.delete(prId);
    }
  }

  /** A fact read that throws counts as missing. */
  private async readIntent(workspaceId: string, prId: string): Promise<Intent | null> {
    try {
      return (await this.container.intent.get(workspaceId, prId)).intent;
    } catch {
      return null;
    }
  }

  private async readBlast(workspaceId: string, prId: string) {
    try {
      const blast = await this.container.blast.get(workspaceId, prId);
      return isBlastAvailable(blast) ? blast : null;
    } catch {
      return null;
    }
  }

  private async readDocuments(repoRow: { id: string; clonePath: string | null }) {
    try {
      return (await this.container.projectContext.resolveForRepo(repoRow)).documents;
    } catch {
      return [];
    }
  }
}

function pickBlast(b: BlastRadius): BlastRadius {
  return { changed_symbols: b.changed_symbols, downstream: b.downstream, summary: b.summary };
}
