import type { PrMeta } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { toPrMeta } from './helpers.js';

/**
 * Pulls service — currently just the `owner/name#N` lookup (D4/D5). The rest
 * of `pulls/routes.ts` stays legacy inline-SQL debt (exempt by name); this is
 * the new route's home, not a rewrite of the module.
 */
export class PullsService {
  constructor(private container: Container) {}

  /**
   * Resolve a PR by its GitHub-native number, scoped to the repo + workspace.
   * `findByNumber` is already workspace- AND repo-scoped, so the common case
   * (the PR is there) is one query. Only on a miss do we check whether the
   * repo itself exists, to pick the right `NotFoundError` text — avoiding a
   * second round trip and a duplicate repo lookup on every hit.
   */
  async getByNumber(workspaceId: string, repoId: string, number: number): Promise<PrMeta> {
    const src = await this.container.pullsRepo.findByNumber(workspaceId, repoId, number);
    if (src) return toPrMeta(src, Date.now());

    const repo = await this.container.pullsRepo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    throw new NotFoundError(`Pull request #${number} is not imported for this repository`);
  }
}
