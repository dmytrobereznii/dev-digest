import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMetaSource } from './helpers.js';

/**
 * PR lookup by `(repo, number)`, workspace-scoped (D4/D5). Reads Postgres
 * only — no GitHub sync. Rows come back as `PrMetaSource`; this repository
 * never calls `toPrMeta`, so the derived-status clock stays out of ring 4.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  /** Resolve a repo in this workspace, so "not yours" and "not there" both 404. */
  async findRepo(workspaceId: string, repoId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)))
      .limit(1);
    return row;
  }

  /** A PR by its GitHub-native `(repo, number)` pair — `(repo_id, number)` is
   * unique. Projects exactly the `PrMetaSource` columns rather than
   * `.select()`-ing every column on `pull_requests` (incl. `body`). */
  async findByNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PrMetaSource | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        branch: t.pullRequests.branch,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        additions: t.pullRequests.additions,
        deletions: t.pullRequests.deletions,
        filesCount: t.pullRequests.filesCount,
        status: t.pullRequests.status,
        lastReviewedSha: t.pullRequests.lastReviewedSha,
        openedAt: t.pullRequests.openedAt,
        updatedAt: t.pullRequests.updatedAt,
      })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      )
      .limit(1);
    return row;
  }
}
