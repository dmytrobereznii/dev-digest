import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * smart-diff module data access (D3/D4, §5) — the only place SQL lives for
 * this module. Reads its own copy of the PR row (mirrors
 * `intent/repository.ts:38` rather than reaching into a sibling module). The
 * repository maps rows to plain shapes, not Drizzle rows or contract types.
 */

import type { PrFileRow, PullRow } from '../../db/rows.js';
export type { PrFileRow, PullRow };

/** One undismissed-or-not finding, reduced to what `buildSmartDiff` needs. */
export interface LatestReviewFinding {
  file: string;
  startLine: number;
  dismissed: boolean;
}

/** The newest `kind='review'` row for a PR (the PR-list rule, D4) and its
 *  findings. `reviewId: null` means the PR has no review yet. */
export interface LatestReviewFindings {
  reviewId: string | null;
  findings: LatestReviewFinding[];
}

export class SmartDiffRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  /** The newest `kind='review'` row for the PR and its findings, mapped to
   *  plain shapes (D4). */
  async latestReviewFindings(prId: string): Promise<LatestReviewFindings> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!latest) return { reviewId: null, findings: [] };

    const rows = await this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .where(eq(t.findings.reviewId, latest.id));

    return {
      reviewId: latest.id,
      findings: rows.map((r) => ({
        file: r.file,
        startLine: r.startLine,
        dismissed: r.dismissedAt !== null,
      })),
    };
  }
}
