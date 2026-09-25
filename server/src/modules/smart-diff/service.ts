import type { SmartDiffResponse } from '@devdigest/shared';
import { classifyFile } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffRepository } from './repository.js';
import { buildSmartDiff } from './helpers.js';

/**
 * smart-diff service (D1/D3/D4, §5). Orchestrates a pure read: the pull must
 * exist (workspace-scoped, 404 otherwise), then folds its files and the
 * latest review's findings through `buildSmartDiff`, classifying paths with
 * reviewer-core's `classifyFile`. No LLM call.
 */
export class SmartDiffService {
  private repo: SmartDiffRepository;

  constructor(container: Container) {
    this.repo = new SmartDiffRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, latest] = await Promise.all([
      this.repo.getPrFiles(prId),
      this.repo.latestReviewFindings(prId),
    ]);

    return buildSmartDiff(files, latest, classifyFile);
  }
}
