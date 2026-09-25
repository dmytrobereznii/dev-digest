import type { DemoPr } from './types.js';

/**
 * PR #499 — the SMART DIFF fixture (spec `.context/specs/08-smart-diff.md`
 * §6). Every other fixture in this directory ships unreviewed; this one is
 * the deliberate exception, because `GET /pulls/:id/smart-diff` needs a
 * state a real run cannot produce on demand: a single PR whose files span
 * every one of the five Smart Diff roles (core, tests, wiring, docs,
 * boilerplate), reviewed, with findings landing in three different groups.
 *
 * Ships on `acme/payments-api` with `lastReviewedSha: null`, same as #482 —
 * carrying a seeded review does not, on its own, make a PR "reviewed" for the
 * list's derived status; only a matching `lastReviewedSha` does
 * (`modules/pulls/status.ts`). That keeps it under the default `needs_review`
 * list filter, same as every fixture in this directory.
 */

/** New file — the whole thing is additions, `@@ -0,0 +1,32 @@`. */
const RETRY_WINDOW_PATCH = `@@ -0,0 +1,32 @@
+/**
+ * A sliding time window that caps how many retries fire within a period.
+ *
+ * Payout retries are driven by webhook replay storms as much as by real
+ * transient failures, so a bare exponential backoff is not enough on its
+ * own — this also bounds total attempts across a rolling window.
+ */
+export interface RetryWindowOptions {
+  /** Max attempts allowed inside the window. */
+  maxAttempts: number;
+  /** Window length in milliseconds. */
+  windowMs: number;
+}
+
+export class RetryWindow {
+  private attempts: number[] = [];
+
+  constructor(private readonly opts: RetryWindowOptions) {}
+
+  /** True when another attempt is allowed inside the current window. */
+  canAttempt(now: number = Date.now()): boolean {
+    this.attempts = this.attempts.filter((t) => now - t < this.opts.windowMs);
+    return this.attempts.length < this.opts.maxAttempts;
+  }
+
+  /** Records an attempt. Callers must call canAttempt() first — this never
+   *  prunes or caps on its own, so skipping that check grows the queue
+   *  forever under a webhook replay storm. */
+  record(now: number = Date.now()): void {
+    this.attempts.push(now);
+  }
+}`;

/** Rewrites the retry route on top of the new window, replacing a bare loop. */
const RETRY_ROUTE_PATCH = `@@ -1,28 +1,31 @@
 import { Router } from 'express';

 import { payoutService } from '../../services/payouts';
+import { RetryWindow } from '../../lib/retry-window';
+import { logger } from '../../lib/logger';

 const router = Router();

-const MAX_RETRIES = 3;
+const retryWindow = new RetryWindow({ maxAttempts: 3, windowMs: 60_000 });

 router.post('/payouts/:id/retry', async (req, res) => {
   const payout = await payoutService.findById(req.params.id);
   if (!payout) {
     return res.status(404).json({ error: 'not_found' });
   }

-  let attempt = 0;
-  while (attempt < MAX_RETRIES) {
-    try {
-      await payoutService.retry(payout.id);
-      return res.json({ status: 'retried' });
-    } catch (err) {
-      attempt++;
-    }
-  }
-
-  return res.status(500).json({ error: 'retry_failed' });
+  if (!retryWindow.canAttempt()) {
+    return res.status(429).json({ error: 'retry_window_exhausted' });
+  }
+
+  retryWindow.record();
+  try {
+    await payoutService.retry(payout.id);
+    return res.json({ status: 'retried' });
+  } catch (err) {
+    logger.error({ err }, 'payout retry failed');
+    return res.status(500).json({ error: 'retry_failed' });
+  }
 });

 export default router;`;

/** New file, tests role. */
const RETRY_WINDOW_TEST_PATCH = `@@ -0,0 +1,15 @@
+import { describe, it, expect } from 'vitest';
+import { RetryWindow } from '../../src/lib/retry-window';
+
+describe('RetryWindow', () => {
+  it('allows the first attempt inside a fresh window', () => {
+    const window = new RetryWindow({ maxAttempts: 2, windowMs: 1000 });
+    expect(window.canAttempt(0)).toBe(true);
+  });
+
+  it('records an attempt so a later check can see it', () => {
+    const window = new RetryWindow({ maxAttempts: 2, windowMs: 1000 });
+    window.record(0);
+    expect(window.canAttempt(10)).toBe(true);
+  });
+});`;

/** Barrel re-export — wiring role. */
const LIB_INDEX_PATCH = `@@ -1,2 +1,3 @@
 export * from './redis';
 export * from './logger';
+export * from './retry-window';`;

/** A new script entry — wiring role (package.json is never boilerplate, D2). */
const PACKAGE_JSON_PATCH = `@@ -14,5 +14,6 @@
   "scripts": {
     "dev": "tsx watch src/server.ts",
     "test": "vitest run --exclude '**/*.it.test.ts'",
+    "test:retry": "vitest run test/lib/retry-window.test.ts",
     "typecheck": "tsc --noEmit"
   },`;

/** New file, docs role. */
const RETRY_WINDOW_DOC_PATCH = `@@ -0,0 +1,15 @@
+# Payout retry window
+
+\`RetryWindow\` caps how many payout retries can fire inside a rolling window,
+separate from any per-call exponential backoff. It exists because retries are
+driven by webhook replay storms as much as by real transient failures.
+
+## Usage
+
+\`\`\`ts
+const window = new RetryWindow({ maxAttempts: 3, windowMs: 60_000 });
+if (window.canAttempt()) {
+  window.record();
+  // ... perform the retry
+}
+\`\`\``;

/** A routine dependency bump — boilerplate role, ~10-line hunk. */
const PNPM_LOCK_PATCH = `@@ -40,10 +40,10 @@
   retry-window-demo:
     dependencies:
-      ioredis: 5.3.2
+      ioredis: 5.4.1
-      ioredis-commands: 1.2.0
+      ioredis-commands: 1.3.0

 packages:
-  ioredis@5.3.2:
-    resolution: {integrity: sha512-abc==}
+  ioredis@5.4.1:
+    resolution: {integrity: sha512-def==}
-  ioredis-commands@1.2.0:
-    resolution: {integrity: sha512-ghi==}
+  ioredis-commands@1.3.0:
+    resolution: {integrity: sha512-jkl==}`;

export const PR_499: DemoPr = {
  number: 499,
  title: 'Cap payout retries with a sliding window',
  author: 'ravi.desai',
  branch: 'feat/payout-retry-window',
  base: 'main',
  headSha: 'c491a08fe2d7',
  additions: 85,
  deletions: 18,
  filesCount: 7,
  ghStatus: 'open',
  body: 'The retry route currently loops up to 3 times per request with no cap across requests, so a webhook replay storm turns into a retry storm. Add a `RetryWindow` that bounds total attempts over a rolling minute and wire it into the retry route.\n\nDocs and a lockfile bump for the Redis client point release included.',
  // Carries a review but stays out of the "reviewed" derived status — see the
  // header comment above and #482's identical pattern.
  lastReviewedSha: null,
  openedDaysAgo: 1,
  updatedDaysAgo: 1,
  files: [
    { path: 'src/lib/retry-window.ts', additions: 32, deletions: 0, patch: RETRY_WINDOW_PATCH },
    { path: 'src/api/payouts/retry.ts', additions: 15, deletions: 12, patch: RETRY_ROUTE_PATCH },
    {
      path: 'test/lib/retry-window.test.ts',
      additions: 15,
      deletions: 0,
      patch: RETRY_WINDOW_TEST_PATCH,
    },
    { path: 'src/lib/index.ts', additions: 1, deletions: 0, patch: LIB_INDEX_PATCH },
    { path: 'package.json', additions: 1, deletions: 0, patch: PACKAGE_JSON_PATCH },
    { path: 'docs/retry-window.md', additions: 15, deletions: 0, patch: RETRY_WINDOW_DOC_PATCH },
    { path: 'pnpm-lock.yaml', additions: 6, deletions: 6, patch: PNPM_LOCK_PATCH },
  ],
  commits: [
    { sha: 'a02f5b1c9de0', message: 'Add a sliding retry window', author: 'ravi.desai' },
    {
      sha: 'c491a08fe2d7',
      message: 'Wire the retry window into the payout retry route',
      author: 'ravi.desai',
    },
  ],
  review: {
    agent: 'General Reviewer',
    verdict: 'request_changes',
    summary:
      'The retry window is a good fix for the replay-storm problem, but the queue it keeps has no cap of its own and the exhausted-window response gives callers no signal for when to try again.',
    score: 42,
    findings: [
      {
        file: 'src/lib/retry-window.ts',
        startLine: 30,
        endLine: 30,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Unbounded retry-attempt queue growth in RetryWindow',
        rationale:
          '`record()` pushes into `attempts` with no cap of its own — pruning only happens inside `canAttempt()`. A caller that records more often than it checks grows the array forever, which is exactly what a webhook replay storm looks like.',
        suggestion: 'Cap or prune inside `record()` too, not only in `canAttempt()`.',
        confidence: 0.9,
      },
      {
        file: 'src/api/payouts/retry.ts',
        startLine: 18,
        endLine: 19,
        severity: 'WARNING',
        category: 'bug',
        title: 'No Retry-After header on the 429 response',
        rationale:
          'A client hitting the exhausted window gets a bare 429 with nothing telling it when to try again, so it is as likely to retry immediately as to back off.',
        suggestion: 'Set a `Retry-After` header to the remaining window in seconds.',
        confidence: 0.8,
      },
      {
        file: 'test/lib/retry-window.test.ts',
        startLine: 10,
        endLine: 14,
        severity: 'SUGGESTION',
        category: 'test',
        title: 'No test exercises the window filling up',
        rationale:
          'Both tests stay under `maxAttempts`; nothing asserts that a third attempt is refused once the cap is hit, or that an attempt outside `windowMs` expires.',
        suggestion: "Add a case that calls record() maxAttempts times and asserts the next canAttempt() is false.",
        confidence: 0.75,
      },
    ],
    run: {
      durationMs: 9400,
      tokensIn: 16200,
      tokensOut: 1380,
      costUsd: 0.017,
      grounding: '3/3 passed',
      blockers: 1,
    },
  },
};
