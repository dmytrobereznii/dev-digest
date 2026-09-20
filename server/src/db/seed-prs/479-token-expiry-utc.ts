import type { DemoPr } from './types.js';

/**
 * PR #479 — the CLEAN fixture.
 *
 * Small (13 changed lines → the S badge, under SIZE_SMALL_MAX = 100) and
 * correct. It exists so the set contains a change with nothing wrong with it:
 * the empty findings panel, the 90+ score band and a zero-blocker run are
 * states no other fixture reaches, and a false positive here is worth more
 * than a true positive anywhere else.
 *
 * Ships unreviewed. Its `updatedAt` is two days old, so a real run turns it
 * into the set's `reviewed` PR — which the default list filter then hides.
 */

/** The real fix: `exp` is epoch SECONDS, `Date.now()` is milliseconds. */
const TOKEN_PATCH = `@@ -18,11 +18,13 @@ import type { JwtPayload } from './types';
 
 /** Decode and validate a bearer token, returning null when it is unusable. */
 export function verifyToken(raw: string): JwtPayload | null {
   const payload = decode(raw);
   if (!payload) return null;
 
-  // exp is seconds since the epoch (UTC).
-  if (payload.exp < Date.now()) return null;
+  // exp is seconds since the epoch (UTC) and Date.now() is milliseconds —
+  // comparing them directly makes every token look expired at boot.
+  const nowSeconds = Math.floor(Date.now() / 1000);
+  if (payload.exp <= nowSeconds) return null;
 
   return payload;
 }`;

/** The regression test, widened to pin the boundary case too. */
const TOKEN_TEST_PATCH = `@@ -30,10 +30,13 @@ describe('verifyToken', () => {
   it('accepts a token that has not expired', () => {
     const raw = sign({ sub: 'u_1', exp: nowSeconds() + 60 });
     expect(verifyToken(raw)).toMatchObject({ sub: 'u_1' });
   });
 
-  it('rejects an expired token', () => {
-    const raw = sign({ sub: 'u_1', exp: 1 });
+  it.each([
+    ['expired a second ago', nowSeconds() - 1],
+    ['expiring exactly now', nowSeconds()],
+  ])('rejects a token %s', (_label, exp) => {
+    const raw = sign({ sub: 'u_1', exp });
     expect(verifyToken(raw)).toBeNull();
   });
 });`;

export const PR_479: DemoPr = {
  number: 479,
  title: 'Fix token expiry comparison to use UTC seconds',
  author: 'theo.almeida',
  branch: 'fix/token-expiry-utc',
  base: 'main',
  headSha: 'c4f10ab7d2e9',
  additions: 9,
  deletions: 4,
  filesCount: 2,
  ghStatus: 'open',
  body: 'Every issued token was treated as expired because `exp` (epoch seconds) was compared against `Date.now()` (milliseconds). Compare in seconds and widen the test to cover the exact-expiry boundary.\n\nCloses #477.',
  // Never reviewed → `needs_review`. Once a real run stamps `lastReviewedSha`
  // the two-day-old `updatedAt` below makes it derive `reviewed`.
  lastReviewedSha: null,
  openedDaysAgo: 3,
  updatedDaysAgo: 2,
  files: [
    { path: 'src/auth/token.ts', additions: 4, deletions: 2, patch: TOKEN_PATCH },
    { path: 'src/auth/token.test.ts', additions: 5, deletions: 2, patch: TOKEN_TEST_PATCH },
  ],
  commits: [
    { sha: 'c4f10ab7d2e9', message: 'Compare token expiry in epoch seconds', author: 'theo.almeida' },
  ],
  // Unreviewed on purpose — run a real agent against it.
  //
  // ANSWER KEY: there is nothing wrong with this change. The unit fix is
  // correct and the `<=` boundary is deliberate (a token expiring exactly now
  // is expired). A good run returns `approve`, a score of 90+, and NO
  // findings. Anything reported here is a false positive, which is the point
  // of keeping one clean fixture in the set.
  review: null,
};
