import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentConfidence, IntentSignal, IntentSource } from '@devdigest/shared';
import type { IntentRow, PrCommitRow, PrFileRow, PullRow, RepoRow } from '../../db/rows.js';

/**
 * intent module data access (D1/§5.2) — the only place SQL lives for this
 * module. Reads its own copy of the PR rows it needs (mirrors the pattern in
 * `reviews/repository/pull.repo.ts` and `pulls/routes.ts`, rather than
 * reaching into a sibling module) plus owns `pr_intent` itself.
 */

// Re-exported so `service.ts`/`helpers.ts` import row types from HERE rather
// than `db/rows.js` directly — same pattern as `reviews/repository.ts`
// (`export type { FindingRow, PullRow }`), which is what keeps THOSE files off
// the `persistence-in-service` warning despite handling row shapes.
export type { IntentRow, PrCommitRow, PrFileRow, PullRow, RepoRow };

export interface UpsertIntentValues {
  intentText: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  signals: IntentSignal[];
  sources: IntentSource[];
  /** Resolved model slug; null is never written here (a derivation always has one). */
  model: string | null;
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  headSha: string | null;
  prTextHash: string | null;
}

export class IntentRepository {
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

  async getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  async get(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }

  /** Overwrites every column and sets `derivedAt = now()` (D3). A failed
   *  derivation calls this NEVER — the caller only reaches here after a
   *  successful `deriveIntent` call, so the previous row survives any failure. */
  async upsert(prId: string, v: UpsertIntentValues): Promise<IntentRow> {
    const values = {
      prId,
      intent: v.intentText,
      inScope: v.inScope,
      outOfScope: v.outOfScope,
      confidence: v.confidence,
      signals: v.signals,
      sources: v.sources,
      model: v.model,
      costUsd: v.costUsd,
      tokensIn: v.tokensIn,
      tokensOut: v.tokensOut,
      headSha: v.headSha,
      prTextHash: v.prTextHash,
      derivedAt: new Date(),
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return row!;
  }
}
