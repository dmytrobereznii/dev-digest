import type { DemoPr } from './types.js';
import { PR_474 } from './474-invoice-pipeline.js';
import { PR_479 } from './479-token-expiry-utc.js';
import { PR_486 } from './486-partner-webhooks.js';

export type { DemoPr } from './types.js';
export { seedDemoPr, type SeedPrContext } from './helpers.js';

/**
 * Demo pull requests beyond #482, which keeps its own block in `seed.ts`
 * because the e2e flows pin its exact values (see e2e/.context/docs/
 * seed-contract.md).
 *
 * They ship UNREVIEWED — diff, files and commits only, no review, findings,
 * run or cost. The review surface is meant to be filled by real agent runs;
 * what each one should turn up is written as an answer key beside its
 * `review: null`. Set `review` on a fixture only for a state a real run cannot
 * produce on demand.
 *
 * What they cover that #482 alone cannot: size (S / M / L), quality (a clean
 * change, a critically broken one, and a large refactor with minor issues), a
 * PR description past MAX_PR_DESCRIPTION_CHARS, one carrying a prompt-injection
 * attempt, and files with no patch — which the reviewer skips, so #474 is
 * reviewed on 4 of its 14 files.
 *
 * All three start as `needs_review`. Their `updatedAt` values differ, so the
 * first real run spreads them across the derived statuses: #474 (20 days old)
 * becomes `stale`, #479 and #486 become `reviewed` — and the default list
 * filter then hides them, which is the filter they exist to exercise.
 */
export const DEMO_PRS: DemoPr[] = [PR_479, PR_486, PR_474];
