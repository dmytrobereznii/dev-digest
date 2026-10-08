import { and, eq } from 'drizzle-orm';
import { FEATURE_MODELS, type PrBriefStored } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * L05 PR-brief seed — one hand-authored `pr_brief` row for demo PR #482,
 * INSERT-ONLY: a brief the user generated is never overwritten by a later
 * `pnpm db:seed` run (same rule as `seed-intent.ts`). Every text describes the
 * seeded patches in `seed-diffs.ts`, and every reference sits on a new-side
 * line of them, so the brief passes the grounding rules unchanged. `blast` and
 * `specs` are missing inputs: the demo repo is never cloned or indexed.
 */

const RISK_BRIEF_MODEL = FEATURE_MODELS.find((f) => f.id === 'risk_brief')!.defaultModel;

/** The pure fixture for PR #482, stamped with the PR row's id and head SHA. */
export function seedBrief482(pr: { id: string; headSha: string }): PrBriefStored {
  return {
    summary:
      "Adds a token-bucket rate limiter in front of the public API and applies it to the Stripe webhook route, so unauthenticated clients can no longer flood those endpoints. Limiter settings are added to the shared config, and the user list endpoint now returns each user's organisations and preferences.",
    // The #482 intent fixture of `seed-intent.ts`.
    intent: {
      intent: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      in_scope: [
        'Add middleware for rate limiting',
        'Apply to /api/public/* routes',
        'Return 429 with Retry-After header',
      ],
      out_of_scope: ['Authentication changes', 'Adding new endpoints', 'Logging / observability for the limiter'],
    },
    blast: null,
    risks: {
      risks: [
        {
          kind: 'security',
          title: 'Auth surface touched',
          explanation:
            'The webhook route now verifies the Stripe signature: verifySignature builds an HMAC from config.stripeSecretKey and compares it with crypto.timingSafeEqual. A bug here changes which webhook payloads are trusted.',
          severity: 'high',
          file_refs: ['src/api/public/webhooks.ts:9-19'],
        },
        {
          kind: 'perf',
          title: 'In-process buckets grow without bound',
          explanation:
            'The limiter keeps one bucket per client key in a module-level Map and removes entries only in the test seam resetRateLimiter, so memory grows with the number of distinct keys. The key comes from the x-forwarded-for header when present, which the caller controls.',
          severity: 'medium',
          file_refs: ['src/middleware/ratelimit.ts:16'],
        },
      ],
    },
    review_focus: [
      { file: 'src/config.ts', line: 12, reason: 'live Stripe key (sk_live_…) committed in plaintext' },
      { file: 'src/middleware/ratelimit.ts', line: 71, reason: '429 branch sends the reply with no return after it' },
      { file: 'src/api/users.ts', line: 46, reason: 'N+1 query — one orgs lookup and one prefs lookup per user' },
    ],
    history: { history: [] },
    pr_id: pr.id,
    head_sha: pr.headSha,
    generated_at: new Date().toISOString(),
    model: RISK_BRIEF_MODEL,
    tokens_in: 1420,
    tokens_out: 310,
    cost_usd: 0.0031,
    missing_inputs: ['blast', 'specs'],
    specs_used: [],
    dropped: { risks: 0, review_focus: 0 },
  };
}

export async function seedBrief(db: Db, args: { repoId: string }): Promise<void> {
  const [pr482] = await db
    .select({ id: t.pullRequests.id, number: t.pullRequests.number, headSha: t.pullRequests.headSha })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, args.repoId), eq(t.pullRequests.number, 482)));
  if (!pr482) return;
  const [existing] = await db.select({ prId: t.prBrief.prId }).from(t.prBrief).where(eq(t.prBrief.prId, pr482.id));
  if (existing) return; // insert-only — a generated brief is the user's, not the seed's to redo.
  await db.insert(t.prBrief).values({ prId: pr482.id, json: seedBrief482(pr482) });
}
