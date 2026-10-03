import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrFileRow, PullRow, RepoRow } from '../../db/rows.js';

/**
 * brief module data access — the only place SQL lives for it. Reads its own
 * copy of the PR rows it needs and owns `pr_brief`.
 */
export type { PrFileRow, PullRow, RepoRow };

export class BriefRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  /** The stored JSON, unparsed; the service validates it. */
  async get(prId: string): Promise<unknown | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row?.json;
  }

  /** Insert, or replace the one row of this PR. */
  async upsert(prId: string, json: unknown): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
