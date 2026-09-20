import type { DemoPr } from './types.js';

/**
 * PR #474 — the LARGE fixture.
 *
 * 14 files and well over SIZE_MEDIUM_MAX (400) changed lines, so it carries the
 * L badge. Ships unreviewed; its `updatedAt` is 20 days old, past STALE_DAYS
 * (7), so the first real run turns it into the seed's only `stale` PR.
 *
 * Only 4 of the 14 files carry a patch. That is the point: GitHub omits
 * patches for very large files, `diffFromPrFiles` SKIPS null-patch rows, and a
 * real run on this PR therefore reviews a fraction of what the header claims.
 * It is the fixture for "the agent only saw part of the change".
 *
 * It should also be the fixture that produces the longest findings list, which
 * is what gives the severity filter and the scrolling findings panel something
 * to work with.
 */

/** New orchestrator extracted from the 900-line invoice.ts. */
const PIPELINE_PATCH = `@@ -0,0 +1,45 @@
+import type { Invoice, InvoiceDraft, Stage, StageResult } from '../types';
+import { collectLineItems, applyProration, applyTax, roundTotals } from './stages';
+
+/**
+ * Ordered invoice stages. Each takes a draft and returns a new draft; nothing
+ * mutates the input, so a stage can be re-run in isolation for support.
+ */
+const STAGES: Stage[] = [collectLineItems, applyProration, applyTax, roundTotals];
+
+export interface PipelineOptions {
+  /** Stop at this stage (exclusive) — used by the invoice preview endpoint. */
+  until?: string;
+  /** Keep going when a stage throws, collecting the error instead. */
+  lenient?: boolean;
+}
+
+export async function runInvoicePipeline(
+  draft: InvoiceDraft,
+  opts: PipelineOptions = {},
+): Promise<{ invoice: Invoice; results: StageResult[] }> {
+  const results: StageResult[] = [];
+  let current = draft;
+
+  for (const stage of STAGES) {
+    if (opts.until && stage.name === opts.until) break;
+
+    const startedAt = Date.now();
+    try {
+      current = await stage(current);
+      results.push({ stage: stage.name, ok: true, ms: Date.now() - startedAt });
+    } catch (err) {
+      results.push({ stage: stage.name, ok: false, ms: Date.now() - startedAt });
+      if (!opts.lenient) throw err;
+    }
+  }
+
+  return { invoice: current as Invoice, results };
+}
+
+/** Re-run a single stage against a persisted draft. Support tooling only. */
+export async function runStage(name: string, draft: InvoiceDraft): Promise<InvoiceDraft> {
+  const stage = STAGES.find((s) => s.name === name);
+  if (!stage) throw new Error('unknown stage: ' + name);
+  return stage(draft);
+}`;

/** Proration moved out of invoice.ts, still doing float money math. */
const PRORATION_PATCH = `@@ -1,6 +1,23 @@
 import type { InvoiceDraft, Period } from './types';
 
-export function proratedAmount(amount: number, period: Period): number {
-  const days = daysBetween(period.start, period.end);
-  return (amount / 30) * days;
-}
+const DAYS_IN_BILLING_MONTH = 30;
+
+/**
+ * Prorate a monthly amount across a partial period. Amounts are in major
+ * units, so a half-cent here becomes a rounding difference on the invoice.
+ */
+export function proratedAmount(amount: number, period: Period): number {
+  const days = daysBetween(period.start, period.end);
+  const perDay = amount / DAYS_IN_BILLING_MONTH;
+  return perDay * days;
+}
+
+export function applyProration(draft: InvoiceDraft): InvoiceDraft {
+  const lines = draft.lines.map((line) => {
+    if (!line.period) return line;
+    return { ...line, amount: proratedAmount(line.amount, line.period) };
+  });
+
+  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
+  return { ...draft, lines, subtotal };
+}`;

/** The route now calls the pipeline instead of the monolith. */
const INVOICES_ROUTE_PATCH = `@@ -1,13 +1,19 @@
 import { Router } from 'express';
-import { buildInvoice } from '../../billing/invoice';
+import { runInvoicePipeline } from '../../billing/invoice/pipeline';
 
 const router = Router();
 
 router.get('/invoices', async (req, res) => {
-  const { limit = 50 } = req.query;
-  const drafts = await loadDrafts(req.orgId, Number(limit));
-  const invoices = drafts.map(buildInvoice);
-  return res.json(invoices);
+  const limit = Number(req.query.limit ?? 50);
+  const drafts = await loadDrafts(req.orgId, limit);
+
+  const invoices = [];
+  for (const draft of drafts) {
+    const { invoice, results } = await runInvoicePipeline(draft, { lenient: true });
+    invoices.push({ ...invoice, stages: results });
+  }
+
+  return res.json(invoices);
 });
 
 export default router;`;

/** What is left of the monolith: a thin re-export shim. */
const INVOICE_SHIM_PATCH = `@@ -1,16 +1,7 @@
-import { collectLineItems } from './line-items';
-import { proratedAmount } from './proration';
-import { taxFor } from './tax';
-
-/**
- * Build an invoice from a draft. Grew organically since 2019; every branch
- * below is load-bearing for at least one customer.
- */
-export function buildInvoice(draft) {
-  const lines = collectLineItems(draft);
-  const prorated = lines.map((l) => ({ ...l, amount: proratedAmount(l.amount, l.period) }));
-  const taxed = prorated.map((l) => ({ ...l, tax: taxFor(l, draft.org) }));
-  const subtotal = taxed.reduce((s, l) => s + l.amount, 0);
-  const tax = taxed.reduce((s, l) => s + l.tax, 0);
-  return { ...draft, lines: taxed, subtotal, tax, total: subtotal + tax };
-}
+/**
+ * @deprecated The invoice build moved to ./invoice/pipeline. This module stays
+ * as a re-export so the jobs package keeps compiling; delete it once
+ * src/jobs/invoice-run.ts imports the pipeline directly.
+ */
+export { runInvoicePipeline as buildInvoice } from './invoice/pipeline';
+export { runStage } from './invoice/pipeline';`;

export const PR_474: DemoPr = {
  number: 474,
  title: 'Extract the invoice build into a staged pipeline',
  author: 'priya.raghunathan',
  branch: 'refactor/invoice-pipeline',
  base: 'main',
  headSha: 'e58d1c93b7a0',
  additions: 829,
  deletions: 349,
  filesCount: 14,
  ghStatus: 'open',
  body:
    // Deliberately longer than MAX_PR_DESCRIPTION_CHARS (4000) so the prompt's
    // truncation of the untrusted PR description is exercised.
    '## What this does\n\n`src/billing/invoice.ts` had grown to just over 900 lines and every change to it was a two-day review. This PR splits the build into four ordered stages behind a single `runInvoicePipeline` entry point, with no intended change in output.\n\n## The stages\n\n1. `collectLineItems` - gathers subscription, usage and one-off lines for the period.\n2. `applyProration` - prorates anything with a partial period.\n3. `applyTax` - resolves the jurisdiction and applies the rate per line.\n4. `roundTotals` - settles the invoice to minor units and reconciles the remainder.\n\nEach stage is a pure `(draft) => draft`, so support can re-run one against a persisted draft with `runStage` instead of rebuilding the whole invoice. That is the main reason for the split: the current on-call runbook for a wrong invoice is "read the monolith and guess", and the monolith has four different code paths that can produce the same wrong total.\n\n## Why a pipeline and not just smaller functions\n\nWe tried the smaller-functions version twice (BILL-1904, BILL-2077) and both times it regressed into the same shape, because the ordering constraints between the steps were never written down anywhere - they lived in the sequence of statements inside `buildInvoice`. Making the order an explicit array is the part that stops it growing back. It also gives the preview endpoint somewhere honest to stop: `runInvoicePipeline(draft, { until: \'applyTax\' })` replaces the copy of the first two steps that `src/api/billing/preview.ts` was maintaining separately.\n\n## Compatibility\n\n`src/billing/invoice.ts` stays as a re-export shim so `src/jobs/invoice-run.ts` keeps compiling. I would rather delete it in this PR, but the jobs package has its own release train and I did not want to couple the two. Follow-up is tracked in BILL-2291.\n\n`src/billing/legacy/invoice-v1.ts` loses most of its body: everything it held was either dead since the 2023 tax migration or duplicated in the new stages. The remaining 19 lines are the two constants the reporting export still reads.\n\n## What is NOT in scope\n\n- Moving money to integer minor units. The float arithmetic is carried over as-is; changing it in the same PR would make the behavioural diff impossible to review. Tracked in BILL-2288.\n- The rounding policy itself. `roundTotals` reproduces the existing half-up behaviour exactly, including the case where the remainder lands on the last line rather than the largest.\n- Any change to the invoice schema or the API response shape, beyond the additive `stages` field on the list endpoint.\n- Concurrency. The list endpoint still walks drafts one at a time; making that parallel needs a bounded pool and a look at the tax provider\'s rate limits.\n\n## Testing\n\n`test/billing/pipeline.test.ts` is new and covers each stage in isolation plus the full pipeline against fourteen recorded drafts pulled from production (anonymised). `test/billing/proration.test.ts` was rewritten against the extracted module; the assertions are unchanged.\n\nI also ran the pipeline over every invoice issued in the last billing cycle and diffed the output against what we actually sent. 41,882 invoices, zero differences in the total, four differences of one minor unit in the per-line tax breakdown - all four are cases where the old code rounded twice and the new code rounds once. I believe the new behaviour is correct but flagged it for finance before merge; the four invoice ids are in the ticket.\n\n## Review guidance\n\nThe diff is large but most of it is movement. The files worth actual attention are `src/billing/invoice/pipeline.ts` (new orchestration, including the lenient-mode error handling) and `src/billing/proration.ts` (the only place where the extracted logic was reshaped rather than moved). Everything under `src/billing/invoice/` beyond the pipeline is a straight lift from the monolith with imports rewritten, and `git log --follow` on each should show that cleanly.\n\n## Rollout\n\nNo flag. The pipeline is behind the same entry point the jobs package already calls, and the output is byte-identical on the replay above. If something does go wrong, reverting is a single revert of this commit - the shim means nothing downstream has changed its imports yet. I would like to merge early in the cycle rather than the week before invoicing runs.',
  // Never reviewed → `needs_review`. The 20-day-old `updatedAt` is past
  // STALE_DAYS (7), so the first real run turns this into the set's `stale` PR.
  lastReviewedSha: null,
  openedDaysAgo: 34,
  updatedDaysAgo: 20,
  files: [
    { path: 'src/billing/invoice/pipeline.ts', additions: 45, deletions: 0, patch: PIPELINE_PATCH },
    { path: 'src/billing/proration.ts', additions: 21, deletions: 4, patch: PRORATION_PATCH },
    { path: 'src/api/billing/invoices.ts', additions: 11, deletions: 5, patch: INVOICES_ROUTE_PATCH },
    { path: 'src/billing/invoice.ts', additions: 7, deletions: 16, patch: INVOICE_SHIM_PATCH },
    // The other ten: real rows on the PR, no patch from GitHub. The reviewer
    // never sees them, which is exactly the situation this fixture recreates.
    { path: 'src/billing/invoice/stages.ts', additions: 164, deletions: 0, patch: null },
    { path: 'src/billing/invoice/line-items.ts', additions: 121, deletions: 0, patch: null },
    { path: 'src/billing/invoice/tax.ts', additions: 88, deletions: 0, patch: null },
    { path: 'src/billing/invoice/rounding.ts', additions: 43, deletions: 0, patch: null },
    { path: 'src/billing/types.ts', additions: 37, deletions: 11, patch: null },
    { path: 'src/billing/index.ts', additions: 12, deletions: 19, patch: null },
    { path: 'src/jobs/invoice-run.ts', additions: 61, deletions: 44, patch: null },
    { path: 'src/billing/legacy/invoice-v1.ts', additions: 19, deletions: 213, patch: null },
    { path: 'test/billing/pipeline.test.ts', additions: 142, deletions: 0, patch: null },
    { path: 'test/billing/proration.test.ts', additions: 58, deletions: 37, patch: null },
  ],
  commits: [
    { sha: 'e58d1c93b7a0', message: 'Point the jobs package at the pipeline', author: 'priya.raghunathan' },
    { sha: '9a07f2e4c165', message: 'Extract tax and rounding stages', author: 'priya.raghunathan' },
    { sha: '2c61b8d0e934', message: 'Introduce the staged invoice pipeline', author: 'priya.raghunathan' },
  ],
  // Unreviewed on purpose — run a real agent against it.
  //
  // ANSWER KEY — one WARNING and a handful of SUGGESTIONs, all in the four
  // PATCHED files. The other ten have no patch, so a run cannot see them:
  //   - `src/billing/proration.ts:10-12` (WARNING) — money prorated in
  //     floating point; pre-existing, but now applied per line item.
  //   - `src/billing/invoice/pipeline.ts:31-33` — lenient mode records that a
  //     stage failed but drops the error.
  //   - `src/billing/invoice/pipeline.ts:37` — `current as Invoice` asserts a
  //     complete invoice that nothing checks, and is wrong under `until`.
  //   - `src/api/billing/invoices.ts:7-8` — caller-controlled page size with
  //     no ceiling, now running a four-stage async pipeline per draft.
  //   - `src/billing/invoice.ts:1-7` — deprecation shim with no removal
  //     trigger.
  //   - `src/billing/proration.ts:3` — a 30-day billing month is a policy
  //     rather than a constant.
  //
  // The interesting question is not whether a run finds these, but whether it
  // notices it is only seeing 4 of 14 files, and whether it reports anything
  // about the ten it cannot see (it should not — the grounding gate drops a
  // citation on a file with no hunks).
  review: null,
};
