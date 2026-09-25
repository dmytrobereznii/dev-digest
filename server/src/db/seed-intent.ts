import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { FEATURE_MODELS, type IntentSource } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * L03 intent-layer seed data (spec 07 §7) — one `pr_intent` row per demo PR,
 * INSERT-ONLY: a row is written once and never touched again, so a user who
 * re-derives (or edits nothing at all) never has their row silently
 * overwritten by a later `pnpm db:seed` run. There are no pre-existing seeded
 * `pr_intent` rows to backfill — `upsertIntent`/`getIntent` (the only writers
 * before this module existed) had no callers (server INSIGHTS 2026-09-21's
 * backfill rule therefore does not apply here).
 *
 * Both rows are HAND-AUTHORED, like the sample review + findings on #482
 * above in `seed.ts` — not the output of a real `deriveIntent` call (there is
 * no key at seed time). `head_sha` and `pr_text_hash` are computed from the
 * PR row actually in the DB so `isStale` reads `false` right after seeding
 * (until the PR is edited or re-imported with a new head), matching D2.
 */

const REVIEW_INTENT_MODEL = FEATURE_MODELS.find((f) => f.id === 'review_intent')!.defaultModel;

function prTextHash(title: string, body: string | null | undefined): string {
  return createHash('sha256').update(`${title}\n${body ?? ''}`).digest('hex');
}

export async function seedIntent(
  db: Db,
  args: { workspaceId: string; repoId: string },
): Promise<void> {
  const prs = await db
    .select({
      id: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      body: t.pullRequests.body,
      headSha: t.pullRequests.headSha,
    })
    .from(t.pullRequests)
    .where(eq(t.pullRequests.repoId, args.repoId));
  const byNumber = new Map(prs.map((p) => [p.number, p]));

  // #482 — the design's own INTENT fixture (`.context/docs/design/src/
  // data.jsx:28-40`), 'high' confidence, with one skipped external source so
  // the sources list has something to show on first boot (A11).
  const pr482 = byNumber.get(482);
  if (pr482) {
    await insertIfMissing(db, pr482.id, {
      intent: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      inScope: [
        'Add middleware for rate limiting',
        'Apply to /api/public/* routes',
        'Return 429 with Retry-After header',
      ],
      outOfScope: ['Authentication changes', 'Adding new endpoints', 'Logging / observability for the limiter'],
      confidence: 'high',
      signals: ['title', 'description'],
      sources: [
        {
          kind: 'external',
          ref: 'https://example.com/rate-limit-rollout-plan',
          status: 'skipped',
          reason: 'external_not_fetched',
          title: null,
          chars: null,
          truncated: false,
        },
      ],
      costUsd: 0.0021,
      tokensIn: 1180,
      tokensOut: 96,
      headSha: pr482.headSha,
      prTextHash: prTextHash(pr482.title, pr482.body),
    });
  }

  // #479 — a thin-body illustration of the 'low'/"inferred" case (D7/D11): no
  // linked-doc signal, orientation drawn from title/commits/branch/paths only.
  const pr479 = byNumber.get(479);
  if (pr479) {
    await insertIfMissing(db, pr479.id, {
      intent: 'Fix a token-expiry comparison so a still-valid token is not rejected because of a unit mismatch.',
      inScope: ['Compare `exp` and the current time in the same unit (seconds)', 'Cover the exact-expiry boundary'],
      outOfScope: ['Changing the token format or its issuer'],
      confidence: 'low',
      signals: ['title', 'commits', 'branch', 'file_paths'],
      sources: [],
      costUsd: 0.0008,
      tokensIn: 540,
      tokensOut: 61,
      headSha: pr479.headSha,
      prTextHash: prTextHash(pr479.title, pr479.body),
    });
  }
}

interface SeedIntentRow {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  sources: IntentSource[];
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  headSha: string;
  prTextHash: string;
}

async function insertIfMissing(db: Db, prId: string, v: SeedIntentRow): Promise<void> {
  const [existing] = await db.select({ prId: t.prIntent.prId }).from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (existing) return; // insert-only — a re-derive is the user's to make, not the seed's to redo.
  await db.insert(t.prIntent).values({
    prId,
    intent: v.intent,
    inScope: v.inScope,
    outOfScope: v.outOfScope,
    confidence: v.confidence,
    signals: v.signals,
    sources: v.sources,
    model: REVIEW_INTENT_MODEL,
    costUsd: v.costUsd,
    tokensIn: v.tokensIn,
    tokensOut: v.tokensOut,
    headSha: v.headSha,
    prTextHash: v.prTextHash,
  });
}
