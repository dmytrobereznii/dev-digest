import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * blast module data access (D1/D6, §5) — the only file that imports `db/*`
 * for this module. Reads its own copy of the PR row (mirrors
 * `smart-diff/repository.ts` rather than reaching into a sibling module).
 */

/** Minimal pull shape blast needs: which repo the changed files belong to. */
export interface BlastPull {
  id: string;
  repoId: string;
}

export class BlastRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BlastPull | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)))
      .limit(1);
    return row;
  }

  /**
   * Distinct changed paths for the PR, sorted (D6). `pr_files` has no stable
   * order (server INSIGHTS 2026-09-23) — sorting here just makes the input to
   * the facade deterministic; caller/fact ordering downstream is decided by
   * `toBlastRadius`, not by this order.
   */
  async getChangedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
    return rows.map((r) => r.path);
  }
}
