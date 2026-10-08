import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextOwner } from './constants.js';

/**
 * Project Context data-access: the repository's clone path, owner existence,
 * and the two attachment link tables. Only paths are stored — never text.
 */
export class ProjectContextRepository {
  constructor(private readonly db: Db) {}

  /** The repository's clone path (null when never cloned), or undefined if unknown. */
  async clonePath(workspaceId: string, repoId: string): Promise<string | null | undefined> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row ? row.clonePath : undefined;
  }

  async ownerExists(workspaceId: string, owner: ContextOwner, ownerId: string): Promise<boolean> {
    const table = owner === 'agents' ? t.agents : t.skills;
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, ownerId), eq(table.workspaceId, workspaceId)))
      .limit(1);
    return !!row;
  }

  /** Attached paths of one owner in one repository, in attach order. */
  async attachedPaths(owner: ContextOwner, ownerId: string, repoId: string): Promise<string[]> {
    if (owner === 'agents') {
      const rows = await this.db
        .select({ path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.repoId, repoId), eq(t.agentContextDocs.agentId, ownerId)))
        .orderBy(asc(t.agentContextDocs.seq));
      return rows.map((r) => r.path);
    }
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.repoId, repoId), eq(t.skillContextDocs.skillId, ownerId)))
      .orderBy(asc(t.skillContextDocs.seq));
    return rows.map((r) => r.path);
  }

  /** Attach a path; re-attaching moves it to the end (new `seq`). */
  async attach(owner: ContextOwner, ownerId: string, repoId: string, path: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (owner === 'agents') {
        await tx
          .delete(t.agentContextDocs)
          .where(
            and(
              eq(t.agentContextDocs.repoId, repoId),
              eq(t.agentContextDocs.agentId, ownerId),
              eq(t.agentContextDocs.path, path),
            ),
          );
        await tx.insert(t.agentContextDocs).values({ repoId, agentId: ownerId, path });
      } else {
        await tx
          .delete(t.skillContextDocs)
          .where(
            and(
              eq(t.skillContextDocs.repoId, repoId),
              eq(t.skillContextDocs.skillId, ownerId),
              eq(t.skillContextDocs.path, path),
            ),
          );
        await tx.insert(t.skillContextDocs).values({ repoId, skillId: ownerId, path });
      }
    });
  }

  async detach(owner: ContextOwner, ownerId: string, repoId: string, path: string): Promise<void> {
    if (owner === 'agents') {
      await this.db
        .delete(t.agentContextDocs)
        .where(
          and(
            eq(t.agentContextDocs.repoId, repoId),
            eq(t.agentContextDocs.agentId, ownerId),
            eq(t.agentContextDocs.path, path),
          ),
        );
    } else {
      await this.db
        .delete(t.skillContextDocs)
        .where(
          and(
            eq(t.skillContextDocs.repoId, repoId),
            eq(t.skillContextDocs.skillId, ownerId),
            eq(t.skillContextDocs.path, path),
          ),
        );
    }
  }

  /**
   * (path, agentId) pairs for a repository: direct attachments, plus those of
   * every enabled skill linked to an agent. Callers dedupe by agent.
   */
  async usage(repoId: string): Promise<Array<{ path: string; agentId: string }>> {
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.repoId, repoId));
    const viaSkills = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agentSkills.agentId })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.skillContextDocs.repoId, repoId), eq(t.skills.enabled, true)));
    return [...direct, ...viaSkills];
  }
}
