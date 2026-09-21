import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`, and reads
 * the four `repos` columns the extraction pipeline needs (the same narrow read
 * `repo-intel`'s repository already does for its own clone-path lookups).
 * Workspace-scoped throughout — a repo id from a URL is never trusted to belong
 * to the caller's workspace.
 *
 * THE INVARIANT THIS FILE OWNS: `conventions.accepted` is DERIVED from `status`
 * (D2). Every statement that writes `status` writes
 * `accepted = status === 'accepted'` in the SAME `set()`, so the two can never
 * disagree — there is deliberately no method that writes one without the other.
 */

import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
export type { ConventionRow, ConventionScanRow };

/** `db.transaction`'s handle: the same query builder, inside a transaction. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either handle. The private `…In` methods take one so a public method and the
 *  transaction in `replacePending` can share a single implementation. */
type Executor = Db | Tx;

/** The four `repos` columns the pipeline needs: identity, clone presence. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  sampleCount: number;
  model: string;
}

/** A gated candidate, ready to persist. `status`/`accepted` are not settable:
 *  a fresh candidate is always `pending` (that is what triage means). */
export interface InsertCandidate {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

/**
 * What `PUT /conventions/:id` may change. `status` and `rule`/`category` are
 * independent: the card's Accept/Reject buttons send the first, inline Edit
 * sends the others, and a request may carry either or both.
 *
 * The EVIDENCE is deliberately absent. `evidence_snippet` was verified verbatim
 * against the sampled file by the gate; letting it be retyped would leave a
 * quote that no longer appears in the repo, which is the one thing this module
 * guarantees. Editing the wording of a rule does not touch what proves it.
 */
export interface PatchCandidate {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

/** "Accept all" / "Deselect all" (D2) — never a bulk reject. */
export type BulkStatus = Extract<ConventionStatus, 'pending' | 'accepted'>;

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Identity + clone presence for a repo in this workspace. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * The most recent scan for a repo, or undefined before the first one — which
   * is what drives the page's empty state (D4). Deliberately independent of
   * whether any candidate survived: a scan that grounded nothing still says
   * "last scan 2m ago".
   */
  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.repoId, repoId),
        ),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /**
   * The candidates the page shows: `pending` and `accepted`, best evidence
   * first. `rejected` is excluded HERE rather than filtered by the caller —
   * the artboard draws no rejected card and renders every row it is given
   * unfiltered, and both are true at once only if a rejected row never reaches
   * the client (D2).
   *
   * `NULLS LAST` because `confidence` is nullable in the table (migration 0000)
   * while every write path sets it; Postgres would otherwise sort a null to the
   * TOP of a DESC ordering and put the least-known rule first.
   */
  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(sql`${t.conventions.confidence} desc nulls last`, desc(t.conventions.createdAt));
  }

  /** The settled rows a re-scan must not re-propose: `accepted` and `rejected` (D3). */
  async listSettled(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'pending'),
        ),
      );
  }

  /**
   * Patch one candidate — triage state, wording, or both. Returns undefined
   * when it isn't in this workspace.
   *
   * `accepted` is written only alongside `status` (D2/D3.1), so a rule edit
   * that carries no status leaves the triage state exactly as it was: renaming
   * a rule must not quietly un-accept it.
   */
  async patch(
    workspaceId: string,
    id: string,
    patch: PatchCandidate,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined
          ? { status: patch.status, accepted: patch.status === 'accepted' }
          : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /**
   * Triage every LISTED candidate at once. `rejected` rows are excluded from the
   * `where`, so "Accept all" cannot resurrect something the user threw away and
   * "Deselect all" cannot un-reject it — the toolbar only ever moves rows
   * between the two states the page can see (D2).
   */
  async setStatusAll(
    workspaceId: string,
    repoId: string,
    status: BulkStatus,
  ): Promise<ConventionRow[]> {
    return this.db
      .update(t.conventions)
      .set({ status, accepted: status === 'accepted' })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .returning();
  }

  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    return this.insertScanIn(this.db, values);
  }

  async insertCandidates(values: InsertCandidate[]): Promise<ConventionRow[]> {
    return this.insertCandidatesIn(this.db, values);
  }

  /** Drop this repo's un-triaged rows. Accepted and rejected rows survive (D3). */
  async deletePending(workspaceId: string, repoId: string): Promise<number> {
    return this.deletePendingIn(this.db, workspaceId, repoId);
  }

  /**
   * §3.3 step 7 — the whole persist, in ONE transaction: drop the old pending
   * set, record the scan, insert the survivors. Atomic because a crash between
   * the delete and the insert would leave the page empty with no way to tell
   * that from "the gate discarded everything", and because `conventions.scan_id`
   * points at a row that must exist by the time a candidate references it.
   */
  async replacePending(input: {
    workspaceId: string;
    repoId: string;
    sampleCount: number;
    model: string;
    candidates: Omit<InsertCandidate, 'workspaceId' | 'repoId' | 'scanId'>[];
  }): Promise<{ scan: ConventionScanRow; inserted: ConventionRow[] }> {
    const { workspaceId, repoId, sampleCount, model, candidates } = input;
    return this.db.transaction(async (tx) => {
      await this.deletePendingIn(tx, workspaceId, repoId);
      const scan = await this.insertScanIn(tx, { workspaceId, repoId, sampleCount, model });
      const inserted = await this.insertCandidatesIn(
        tx,
        candidates.map((c) => ({ ...c, workspaceId, repoId, scanId: scan.id })),
      );
      return { scan, inserted };
    });
  }

  // ---- shared implementations (db or transaction handle) -------------------

  private async insertScanIn(db: Executor, values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await db.insert(t.conventionScans).values(values).returning();
    return row!;
  }

  private async insertCandidatesIn(
    db: Executor,
    values: InsertCandidate[],
  ): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return db.insert(t.conventions).values(values).returning();
  }

  private async deletePendingIn(
    db: Executor,
    workspaceId: string,
    repoId: string,
  ): Promise<number> {
    const rows = await db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }
}
