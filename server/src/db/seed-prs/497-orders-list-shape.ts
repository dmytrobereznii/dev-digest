import type { DemoPr } from './types.js';

/**
 * PR #497 — the API-CONTRACT A/B fixture.
 *
 * The lesson's control experiment for `API Contract Reviewer` needs a change to
 * the signature of an EXISTING route. #486 is the closest thing the set had and
 * it does not qualify: it ADDS a route, and a new endpoint breaks no caller.
 * This one rewrites one that is already published, in four ways at once:
 *
 *  1. `total_cents` (integer minor units) becomes `total` (a decimal string) —
 *     a renamed field AND a changed type in one move;
 *  2. `?state=` becomes `?status=`, and the old name is not accepted;
 *  3. an empty page returns `204 No Content` instead of `200` with `[]`, so a
 *     client that parses the body unconditionally now throws;
 *  4. `limit` gains a server-side cap of 100, silently clamping callers that
 *     asked for more and paginated on the count they expected back.
 *
 * None of that is a BUG. The code is internally consistent, the tests were
 * updated with it, the migration is sound, and a reviewer judging correctness
 * alone should be satisfied — which is precisely why it is the A/B. The PR body
 * even describes the change as a cleanup, so the diff, not the prose, has to be
 * what gives it away.
 *
 * WITHOUT `api-contract-gate` linked: expect `approve` or a mild `comment`.
 * WITH it linked: expect the breaking change called out — ideally the rename,
 * the 200→204, and the absence of any version bump or deprecation window.
 *
 * Ships unreviewed, on `acme/payments-api`, with a title that duplicates
 * nothing else in the PR list — e2e's `seed-contract.md` constraints.
 */

/** The route. Correct code; four separate breaks for anyone already calling it. */
const ORDERS_LIST_PATCH = `@@ -8,19 +8,26 @@ import { listOrders } from '../../services/orders';
 const router = Router();

+/** Callers were sending unbounded limits and timing out the read replica. */
+const MAX_LIMIT = 100;
+
 router.get('/orders', async (req, res) => {
-  const state = req.query.state as string | undefined;
-  const limit = Number(req.query.limit ?? 50);
+  const status = req.query.status as string | undefined;
+  const limit = Math.min(Number(req.query.limit ?? 50), MAX_LIMIT);

-  const orders = await listOrders({ state, limit });
+  const orders = await listOrders({ status, limit });
+
+  if (orders.length === 0) {
+    return res.status(204).end();
+  }

   return res.json({
     orders: orders.map((o) => ({
       id: o.id,
-      state: o.state,
-      total_cents: o.totalCents,
+      status: o.status,
+      total: formatAmount(o.totalCents, o.currency),
       currency: o.currency,
       created_at: o.createdAt.toISOString(),
     })),
     count: orders.length,
   });
 });`;

/** The formatter the new field uses. New file, nothing controversial in it. */
const FORMAT_AMOUNT_PATCH = `@@ -0,0 +1,13 @@
+/**
+ * Minor units to a decimal string, e.g. (1999, 'USD') -> '19.99'.
+ *
+ * A string, not a number: JSON numbers are IEEE doubles and a total is money.
+ */
+export function formatAmount(minorUnits: number, currency: string): string {
+  const exponent = ZERO_DECIMAL.has(currency) ? 0 : 2;
+  if (exponent === 0) return String(minorUnits);
+  return (minorUnits / 100).toFixed(2);
+}
+
+/** Currencies with no minor unit — JPY has no cents to divide by. */
+const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND']);`;

/** The tests were updated with the change — they pin the NEW shape, happily. */
const ORDERS_LIST_TEST_PATCH = `@@ -12,15 +12,22 @@ describe('GET /orders', () => {
   it('returns the caller's orders', async () => {
     const res = await request(app).get('/orders?limit=2');

     expect(res.status).toBe(200);
-    expect(res.body.orders[0]).toMatchObject({
-      state: 'paid',
-      total_cents: 1999,
-    });
+    expect(res.body.orders[0]).toMatchObject({
+      status: 'paid',
+      total: '19.99',
+      currency: 'USD',
+    });
   });

+  it('returns 204 when nothing matches', async () => {
+    const res = await request(app).get('/orders?status=refunded');
+    expect(res.status).toBe(204);
+    expect(res.text).toBe('');
+  });
+
   it('caps the limit', async () => {
     const res = await request(app).get('/orders?limit=5000');
     expect(res.body.count).toBeLessThanOrEqual(100);
   });
 });`;

export const PR_497: DemoPr = {
  number: 497,
  title: 'Normalise the orders list response and cap the page size',
  author: 'marcus.bell',
  branch: 'chore/orders-response-cleanup',
  base: 'main',
  headSha: 'd27fa6b0e415',
  additions: 36,
  deletions: 9,
  filesCount: 3,
  ghStatus: 'open',
  body: 'Tidy-up on `GET /orders` before we document it.\n\n- money is a decimal string rather than integer cents, so clients stop dividing by 100 themselves\n- `state` is renamed to `status`, matching every other endpoint\n- an empty result is a 204 instead of a 200 with an empty array\n- `limit` is capped at 100; unbounded reads were timing out the replica\n\nTests updated.',
  lastReviewedSha: null,
  openedDaysAgo: 4,
  updatedDaysAgo: 1,
  files: [
    { path: 'src/api/orders/list.ts', additions: 12, deletions: 5, patch: ORDERS_LIST_PATCH },
    { path: 'src/lib/format-amount.ts', additions: 13, deletions: 0, patch: FORMAT_AMOUNT_PATCH },
    {
      path: 'test/api/orders-list.test.ts',
      additions: 11,
      deletions: 4,
      patch: ORDERS_LIST_TEST_PATCH,
    },
  ],
  commits: [
    { sha: '3f0c85ae71bd', message: 'Format order totals as decimal strings', author: 'marcus.bell' },
    { sha: 'd27fa6b0e415', message: 'Rename state to status and cap the page size', author: 'marcus.bell' },
  ],
  // Unreviewed on purpose — this fixture IS the control experiment.
  //
  // ANSWER KEY. Nothing here is incorrect. Every finding worth reporting is a
  // CONTRACT finding, and only a reviewer told to look for one should raise it:
  //
  //  - `total_cents` → `total`, integer → string: a rename and a type change on
  //    a published field, with no version bump and no transitional period;
  //  - `state` → `status` in both the query and the body, old name rejected;
  //  - 200-with-`[]` → 204: a client doing `res.json()` unconditionally now
  //    throws on an empty page rather than reading an empty list;
  //  - `limit` silently clamped to 100 — a caller that asked for 500 gets 100
  //    with no indication it was capped, which quietly breaks pagination.
  //
  // WITHOUT the skill: `approve`, or a `comment` about the string-money choice.
  // WITH `api-contract-gate`: a WARNING or CRITICAL breaking-change finding
  // anchored in `src/api/orders/list.ts`.
  review: null,
};
