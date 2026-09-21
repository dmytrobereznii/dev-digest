import type { DemoPr } from './types.js';

/**
 * PR #495 — the TEST-QUALITY A/B fixture.
 *
 * The lesson's control experiment for `Test Quality Reviewer` needs a diff that
 * a reviewer with no skill linked has nothing to say about. Every other fixture
 * fails that: #479 is clean AND well tested, #486 is full of real defects, #474
 * is a large refactor whose test files carry no patch at all, and #491 is the
 * conventions A/B. So this one exists for exactly one axis.
 *
 * The production code is CORRECT and deliberately dull — a refund-window check
 * with three branches. What is thin is the TEST: it asserts the happy path and
 * nothing else. Three behaviours the diff introduces go unexercised:
 *
 *  1. the `order.refundedAt !== null` early return (already refunded);
 *  2. the exact-boundary case, `age === REFUND_WINDOW_DAYS` — the `>` in the
 *     implementation is a decision, and no test pins which side it falls on;
 *  3. the `catch` around `clock.now()`, which swallows a clock failure and
 *     returns `false`.
 *
 * That split is the point, and it is why the code must stay free of ordinary
 * bugs: an off-by-one or an unimported symbol would let a run flag something
 * for the wrong reason and the A/B would prove nothing.
 *
 * WITHOUT `test-coverage-nudge` linked: expect `approve`, no findings.
 * WITH it linked: expect the uncovered branch and the boundary case, as
 * SUGGESTION or WARNING, both anchored in `refunds.test.ts`.
 *
 * Ships unreviewed, on `acme/payments-api`, with a title that duplicates
 * nothing else in the PR list — e2e's `seed-contract.md` constraints.
 */

/** The new check. Correct; three branches, one of them an error path. */
const REFUNDS_PATCH = `@@ -0,0 +1,34 @@
+import type { Clock } from '../lib/clock';
+import type { Order } from '../types';
+
+/** Orders stay refundable for this many days after they are paid. */
+export const REFUND_WINDOW_DAYS = 30;
+
+const DAY_MS = 24 * 60 * 60 * 1000;
+
+/**
+ * Whether \`order\` can still be refunded.
+ *
+ * An order that has already been refunded never qualifies again, and a clock
+ * failure is treated as "not refundable" rather than propagating: a refund is
+ * easier to grant late than to claw back.
+ */
+export function refundEligible(order: Order, clock: Clock): boolean {
+  if (order.refundedAt !== null) return false;
+
+  let now: number;
+  try {
+    now = clock.now();
+  } catch {
+    return false;
+  }
+
+  const ageDays = (now - order.paidAt) / DAY_MS;
+  return ageDays <= REFUND_WINDOW_DAYS;
+}
+
+/** Days left in the window, floored at zero. For the customer-facing banner. */
+export function refundDaysLeft(order: Order, clock: Clock): number {
+  const ageDays = (clock.now() - order.paidAt) / DAY_MS;
+  return Math.max(0, Math.ceil(REFUND_WINDOW_DAYS - ageDays));
+}`;

/**
 * The thin test. One case in, one case out — and nothing for the early return,
 * the boundary, or the catch. This is the file a linked skill should flag.
 */
const REFUNDS_TEST_PATCH = `@@ -0,0 +1,24 @@
+import { describe, it, expect } from 'vitest';
+import { refundEligible, refundDaysLeft } from '../../src/billing/refunds';
+
+const clockAt = (ms: number) => ({ now: () => ms });
+
+const PAID_AT = Date.parse('2026-01-01T00:00:00Z');
+const order = { id: 'o_1', paidAt: PAID_AT, refundedAt: null };
+
+describe('refundEligible', () => {
+  it('allows a refund inside the window', () => {
+    const tenDaysLater = PAID_AT + 10 * 24 * 60 * 60 * 1000;
+    expect(refundEligible(order, clockAt(tenDaysLater))).toBe(true);
+  });
+
+  it('refuses a refund after the window', () => {
+    const fortyDaysLater = PAID_AT + 40 * 24 * 60 * 60 * 1000;
+    expect(refundEligible(order, clockAt(fortyDaysLater))).toBe(false);
+  });
+
+  it('reports the days left', () => {
+    const tenDaysLater = PAID_AT + 10 * 24 * 60 * 60 * 1000;
+    expect(refundDaysLeft(order, clockAt(tenDaysLater))).toBe(20);
+  });
+});`;

/** The route that calls it. Small, correct, and covered by nothing new. */
const ORDERS_ROUTE_PATCH = `@@ -14,5 +14,8 @@ import { getOrder } from '../../services/orders';
 router.get('/orders/:id', async (req, res) => {
   const order = await getOrder(req.params.id);
   if (!order) return res.status(404).json({ error: 'not_found' });
-  return res.json({ order });
+  return res.json({
+    order,
+    refundable: refundEligible(order, clock),
+  });
 });`;

export const PR_495: DemoPr = {
  number: 495,
  title: 'Add a refund eligibility window to the orders endpoint',
  author: 'nadia.okoro',
  branch: 'feat/refund-window',
  base: 'main',
  headSha: 'e91b4c7a3f28',
  additions: 62,
  deletions: 1,
  filesCount: 3,
  ghStatus: 'open',
  body: 'Customers can refund an order for 30 days after payment. Adds `refundEligible` / `refundDaysLeft` and surfaces `refundable` on `GET /orders/:id` for the banner.\n\nThe clock is injected so the window is testable without faking timers.',
  lastReviewedSha: null,
  openedDaysAgo: 2,
  updatedDaysAgo: 1,
  files: [
    { path: 'src/billing/refunds.ts', additions: 34, deletions: 0, patch: REFUNDS_PATCH },
    { path: 'test/billing/refunds.test.ts', additions: 24, deletions: 0, patch: REFUNDS_TEST_PATCH },
    { path: 'src/api/orders/index.ts', additions: 4, deletions: 1, patch: ORDERS_ROUTE_PATCH },
  ],
  commits: [
    { sha: '7b3e0d51c9a4', message: 'Add refundEligible and refundDaysLeft', author: 'nadia.okoro' },
    { sha: 'e91b4c7a3f28', message: 'Surface refundable on the order response', author: 'nadia.okoro' },
  ],
  // Unreviewed on purpose — this fixture IS the control experiment.
  //
  // ANSWER KEY. The production code is correct; there is no bug to find. What
  // is missing is test coverage, and only a reviewer told to look for it
  // should say so:
  //
  //  - `refundedAt !== null` — no test refunds an already-refunded order;
  //  - `ageDays === REFUND_WINDOW_DAYS` — the boundary the `<=` decides, and
  //    the two tests sit at 10 and 40 days, well clear of it;
  //  - the `catch` around `clock.now()` — no test makes the clock throw;
  //  - `refundDaysLeft` has no test past the window, where the `Math.max(0, …)`
  //    floor is the whole point.
  //
  // WITHOUT the skill: `approve`, 85+, no findings.
  // WITH `test-coverage-nudge`: the uncovered branch and the boundary, both
  // anchored in `test/billing/refunds.test.ts`.
  review: null,
};
