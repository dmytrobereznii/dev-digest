import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { EMPTY_RESULT } from './constants.js';
import { BlastRepository } from './repository.js';
import { deriveBlastStatus, toBlastRadius } from './helpers.js';

/**
 * blast service (D1/D4/D5/D6/D7, §5). Orchestrates a pure read: the pull must
 * exist (workspace-scoped, 404 otherwise), then the PR's changed files
 * (`pr_files`) decide whether the facade is consulted at all. Everything read
 * comes from the index repo-intel already built — no model call, no clone
 * read, no GitHub call.
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const paths = await this.repo.getChangedPaths(prId);
    const flagOn = this.container.config.repoIntelEnabled;

    // D4 rule 1 — 0 changed files never reaches the facade.
    if (paths.length === 0) {
      const status = deriveBlastStatus({
        changedFileCount: 0,
        flagOn,
        result: null,
        indexState: null,
      });
      return toBlastRadius(EMPTY_RESULT, status, null);
    }

    const [result, indexState] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, paths),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    const status = deriveBlastStatus({
      changedFileCount: paths.length,
      flagOn,
      result,
      indexState,
    });

    // D7 — the caller line numbers come from the indexed commit, not HEAD.
    return toBlastRadius(result, status, indexState.lastIndexedSha || null);
  }
}
