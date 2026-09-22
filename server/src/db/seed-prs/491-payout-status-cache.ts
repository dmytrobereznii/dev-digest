import type { DemoPr } from './types.js';

/**
 * PR #491 — the CONVENTION-VIOLATING fixture.
 *
 * Every other fixture in this directory is graded on correctness: does the code
 * work. This one is graded on *house rules*. The change is functionally fine —
 * it caches payout lookups and it would ship — but it breaks two of the rules
 * the L02 Conventions extractor has already found for this repo
 * (`db/seed-conventions.ts`):
 *
 *  1. _"Always use async/await instead of .then() chains"_ — both files are
 *     written as promise chains, including one nested three deep.
 *  2. _"Redis access goes through src/lib/redis.ts singleton"_ — the new cache
 *     module constructs its own `new Redis(...)` instead of importing the
 *     singleton, and says so in a comment that sounds reasonable.
 *
 * That split is the point: a reviewer with no conventions in its prompt has
 * nothing to object to here and should return `approve`. The same agent with a
 * conventions-derived skill linked should return `request_changes` with two
 * findings. The fixture is the A/B, so keep it free of ordinary bugs — an
 * unimported symbol or an off-by-one would let a run pass for the wrong reason.
 *
 * Ships unreviewed, on `acme/payments-api`, with a title that duplicates
 * nothing in the PR list — the three constraints in e2e's `seed-contract.md`.
 */

/**
 * The new cache module. Violates BOTH rules: its own Redis connection, and a
 * `.then()` chain in each exported function.
 */
const CACHE_PATCH = `@@ -0,0 +1,26 @@
+import Redis from 'ioredis';
+
+import { config } from '../config';
+import { logger } from './logger';
+import type { Payout } from '../types';
+
+// Dedicated connection so a slow payout read cannot stall the shared pool.
+const cache = new Redis(config.redisUrl, { keyPrefix: 'payout:' });
+
+const TTL_SECONDS = 300;
+
+export function readPayout(id: string): Promise<Payout | null> {
+  return cache.get(id).then((raw) => {
+    if (!raw) return null;
+    return JSON.parse(raw) as Payout;
+  });
+}
+
+export function writePayout(payout: Payout): Promise<void> {
+  return cache
+    .set(payout.id, JSON.stringify(payout), 'EX', TTL_SECONDS)
+    .then(() => undefined)
+    .catch((err) => {
+      logger.warn({ err }, 'payout cache write failed');
+    });
+}`;

/**
 * The route, rewritten from `async`/`await` into a three-deep promise chain.
 * The deletions show the repo's own convention being removed, which is what
 * makes this the stronger of the two violations.
 */
const ROUTE_PATCH = `@@ -1,6 +1,8 @@
 import { Router } from 'express';
 
 import { payoutService } from '../services/payouts';
+import { readPayout, writePayout } from '../lib/payout-cache';
+import { logger } from '../lib/logger';
 import type { Payout } from '../types';
 
 const router = Router();
@@ -22,11 +24,21 @@ router.get('/payouts', listPayouts);
 
 /** GET a single payout by id. */
-router.get('/payouts/:id', async (req, res) => {
-  const payout = await payoutService.findById(req.params.id);
-  if (!payout) {
-    return res.status(404).json({ error: 'not_found' });
-  }
-  return res.json(payout);
-});
+router.get('/payouts/:id', (req, res) => {
+  readPayout(req.params.id)
+    .then((cached) => {
+      if (cached) return res.json(cached);
+
+      return payoutService.findById(req.params.id).then((payout) => {
+        if (!payout) {
+          return res.status(404).json({ error: 'not_found' });
+        }
+        return writePayout(payout).then(() => res.json(payout));
+      });
+    })
+    .catch((err) => {
+      logger.error({ err }, 'payout lookup failed');
+      return res.status(500).json({ error: 'internal' });
+    });
+});
 
 export default router;`;

export const PR_491: DemoPr = {
  number: 491,
  title: 'Cache payout status lookups in Redis',
  author: 'nadia.kowalczyk',
  branch: 'feat/payout-status-cache',
  base: 'main',
  headSha: 'b83d5e1f90a4',
  additions: 45,
  deletions: 7,
  filesCount: 2,
  ghStatus: 'open',
  body: 'The payout detail endpoint hits Postgres on every poll and the dashboard polls it every 5s per open payout. Cache the row in Redis for 5 minutes and serve the cached copy when it is present.\n\np95 on `GET /payouts/:id` drops from 180ms to 6ms on staging.',
  // Never reviewed → `needs_review`. A one-day-old `updatedAt` keeps it out of
  // the stale band once a real run stamps `lastReviewedSha`.
  lastReviewedSha: null,
  openedDaysAgo: 2,
  updatedDaysAgo: 1,
  files: [
    { path: 'src/lib/payout-cache.ts', additions: 26, deletions: 0, patch: CACHE_PATCH },
    { path: 'src/api/payouts.ts', additions: 19, deletions: 7, patch: ROUTE_PATCH },
  ],
  commits: [
    {
      sha: '7e21c04ab6d3',
      message: 'Add payout cache helper backed by Redis',
      author: 'nadia.kowalczyk',
    },
    {
      sha: 'b83d5e1f90a4',
      message: 'Serve GET /payouts/:id from the cache',
      author: 'nadia.kowalczyk',
    },
  ],
  // Unreviewed on purpose — this is the A/B fixture for linked conventions.
  //
  // ANSWER KEY (two findings, both SUGGESTION/style, neither a bug):
  //
  //  - `src/lib/payout-cache.ts:8` — `new Redis(config.redisUrl, …)` bypasses
  //    the `src/lib/redis.ts` singleton. A second connection means a second
  //    entry in the pool, its own reconnect backoff, and a `keyPrefix` the
  //    singleton's callers do not see.
  //  - `src/api/payouts.ts:27-42` — the handler was `async`/`await` and is now
  //    a three-level `.then()` chain. The rule is not cosmetic here: the
  //    `.catch()` also swallows errors thrown by `res.json`, which `await` in
  //    a `try`/`catch` would not.
  //
  // WITHOUT a conventions skill linked, the correct output is `approve` with
  // no findings — nothing here is broken. The delta between the two runs is
  // the whole experiment; if the unlinked run already reports these, the
  // agent's base prompt is doing the conventions' job and the A/B is void.
  review: null,
};
