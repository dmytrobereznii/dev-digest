/**
 * Unified-diff hunks for the demo PR (#482, acme/payments-api).
 *
 * The demo repo is never cloned (`repos.clone_path` is null), so
 * `loadDiff` always falls back to `diffFromPrFiles` — which SKIPS any
 * `pr_files` row whose `patch` is null. Without these fixtures the reviewer
 * assembles an EMPTY user message and the run fails at the provider instead
 * of reviewing anything. Seeding a patch per file is what makes the starter's
 * one end-to-end flow (import a PR → review it) actually work offline.
 *
 * Format matches the GitHub API's `File.patch`: hunks only, no `diff --git` /
 * `---` / `+++` headers — `diffFromPrFiles` prepends those.
 *
 * The content is deliberately reviewable: each file carries at least one real
 * defect (a committed secret, an N+1 query, an unbounded cache, a spoofable
 * client key, a missing `return` after a 429) so the built-in agents have
 * something true to find. Line numbers are load-bearing — the seeded sample
 * findings cite `src/config.ts:12` and `src/api/users.ts:45-52`, and the
 * citation-grounding gate drops any finding whose lines miss a real hunk.
 */

/** New file: the token-bucket limiter itself. 84 additions, 0 deletions. */
export const RATELIMIT_PATCH = `@@ -0,0 +1,84 @@
+import type { FastifyReply, FastifyRequest } from 'fastify';
+import { config } from '../config';
+
+/**
+ * Token-bucket rate limiter for the public (unauthenticated) API surface.
+ *
+ * One bucket per client key; buckets refill linearly over the window and are
+ * held in process memory so the limiter works without a Redis round-trip.
+ */
+
+type Bucket = {
+  tokens: number;
+  updatedAt: number;
+};
+
+const buckets = new Map<string, Bucket>();
+
+const WINDOW_MS = config.rateLimitWindowMs;
+const MAX_TOKENS = config.rateLimitMax;
+
+/** Identify the caller: forwarded client IP when present, socket IP otherwise. */
+function clientKey(req: FastifyRequest): string {
+  const forwarded = req.headers['x-forwarded-for'];
+  if (typeof forwarded === 'string' && forwarded.length > 0) {
+    return forwarded.split(',')[0].trim();
+  }
+  return req.ip;
+}
+
+/** Refill a bucket based on elapsed time, capped at MAX_TOKENS. */
+function refill(bucket: Bucket, now: number): Bucket {
+  const elapsed = now - bucket.updatedAt;
+  if (elapsed <= 0) return bucket;
+  const refilled = (elapsed / WINDOW_MS) * MAX_TOKENS;
+  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refilled);
+  bucket.updatedAt = now;
+  return bucket;
+}
+
+function take(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
+  const now = Date.now();
+  const existing = buckets.get(key);
+  const bucket = existing
+    ? refill(existing, now)
+    : { tokens: MAX_TOKENS, updatedAt: now };
+
+  if (bucket.tokens < 1) {
+    const retryAfterMs = Math.ceil((1 - bucket.tokens) * (WINDOW_MS / MAX_TOKENS));
+    buckets.set(key, bucket);
+    return { allowed: false, remaining: 0, retryAfterMs };
+  }
+
+  bucket.tokens -= 1;
+  buckets.set(key, bucket);
+  return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
+}
+
+/**
+ * Fastify preHandler for the public API. Rejects over-limit callers with 429
+ * and the standard RateLimit-* response headers.
+ */
+export async function rateLimit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
+  const key = clientKey(req);
+  const result = take(key);
+
+  reply.header('RateLimit-Limit', String(MAX_TOKENS));
+  reply.header('RateLimit-Remaining', String(result.remaining));
+
+  if (!result.allowed) {
+    reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
+    reply.code(429).send({
+      error: 'rate_limited',
+      message: 'Too many requests from ' + key,
+      retryAfterMs: result.retryAfterMs,
+    });
+  }
+}
+
+/** Test seam: drop every bucket. */
+export function resetRateLimiter(): void {
+  buckets.clear();
+}
+
+export const __test__ = { clientKey, refill, take };`;

/**
 * Wire the limiter into the public webhook route + verify the Stripe
 * signature. 31 additions, 6 deletions.
 */
export const WEBHOOKS_PATCH = `@@ -1,14 +1,39 @@
 import { Router } from 'express';
 import crypto from 'crypto';
 import { config } from '../../config';
+import { rateLimit } from '../../middleware/ratelimit';
 
 const router = Router();
 
-router.post('/webhooks/stripe', async (req, res) => {
-  // TODO: verify the Stripe signature before trusting this payload
-  const event = JSON.parse(req.body.toString());
-  await handleEvent(event);
-  return res.json({ received: true });
-});
+/** Constant-time compare of the v1 signature against our own HMAC. */
+function verifySignature(payload: Buffer, header: string | undefined): boolean {
+  if (!header) return false;
+  const parts = Object.fromEntries(
+    header.split(',').map((kv) => kv.split('=') as [string, string]),
+  );
+  const expected = crypto
+    .createHmac('sha256', config.stripeSecretKey)
+    .update(parts.t + '.' + payload.toString())
+    .digest('hex');
+  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
+}
+
+router.post('/webhooks/stripe', rateLimit, async (req, res) => {
+  const signature = req.headers['stripe-signature'] as string | undefined;
+
+  if (!verifySignature(req.body, signature)) {
+    console.log('rejected webhook, signature=' + signature, 'body=' + req.body.toString());
+    return res.status(400).json({ error: 'bad_signature' });
+  }
+
+  const event = JSON.parse(req.body.toString());
+
+  for (const item of event.data.object.lines.data) {
+    await recordLineItem(event.id, item);
+  }
+
+  await handleEvent(event);
+  return res.json({ received: true });
+});
 
 export default router;`;

/** Config additions the limiter reads — plus a committed secret. 4 additions. */
export const CONFIG_PATCH = `@@ -8,4 +8,8 @@ const env = process.env;
 export const config = {
   port: Number(env.PORT ?? 3000),
+  rateLimitWindowMs: 60_000,
+  rateLimitMax: 100,
+  stripeSecretKey: 'sk_live_51MxEXAMPLEnotArealKEYdoNOTuse0000',
+  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
   logLevel: env.LOG_LEVEL ?? 'info',
 };`;

/** Enrich the user list behind the new limiter — introduces an N+1. 7/2. */
export const USERS_PATCH = `@@ -42,6 +42,11 @@ import { eq } from 'drizzle-orm';
 export async function listUsers(req: Request, res: Response) {
   const { limit = 100 } = req.query;
   const users = await db.select().from(usersTable).limit(limit);
-  return res.json(users);
-}
+  const enriched = [];
+  for (const user of users) {
+    const orgs = await db.select().from(orgsTable).where(eq(orgsTable.userId, user.id));
+    const prefs = await db.select().from(prefsTable).where(eq(prefsTable.userId, user.id));
+    enriched.push({ ...user, orgs, prefs });
+  }
+  return res.json(enriched);
 }`;
