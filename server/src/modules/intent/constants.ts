/** Constants for the intent module (spec 07 — server-side I/O policy). */

/** Per-reference resolution timeout (D9). Each reference (issue/pull/file) is
 *  wrapped in `withTimeout(…, REFERENCE_TIMEOUT_MS)` and resolved independently
 *  — one slow reference never blocks the others (`Promise.allSettled`-style
 *  isolation, sequential here because the one-hop pass depends on which issues
 *  resolved). */
export const REFERENCE_TIMEOUT_MS = 10_000;

/**
 * Combined reference-resolution budget across the PR body AND the one hop into
 * linked issue bodies (D5). Mirrors reviewer-core's own `MAX_REFERENCES`
 * (`reviewer-core/src/intent/constants.ts`) — duplicated rather than imported
 * because that constant caps ONE `extractReferences` call, while this one has
 * to span TWO passes (the PR body, then each resolved issue's body) that
 * `extractReferences` itself has no way to see.
 */
export const MAX_REFERENCES = 5;

/**
 * A resolved doc's char budget before it counts as `truncated: true` on its
 * `IntentSource` (D9/D10) — mirrors reviewer-core's `MAX_DOC_CHARS`, which is
 * where the actual cut happens when the prompt is built. Best-effort: the
 * COMBINED cap across all docs (reviewer-core's `MAX_ALL_DOCS_CHARS`) can still
 * truncate a doc that is individually under this number; flagging that case
 * would need reviewer-core's `deriveIntent` to report per-doc truncation,
 * which it does not (D4's `IntentDraft` carries no such detail either).
 */
export const MAX_DOC_CHARS = 6_000;

/**
 * "Raise the route's timeout" (D9/§5.2) has nothing to raise: `app.ts` passes
 * no `requestTimeout` to Fastify, and Fastify's own default is `0` (disabled),
 * so `POST /pulls/:id/intent` already has no server-side deadline. The real
 * bound is the classifier's own `CLASSIFIER_TIMEOUT_MS` (60s,
 * `reviewer-core/src/intent/constants.ts`) plus up to `MAX_REFERENCES` reference
 * fetches at `REFERENCE_TIMEOUT_MS` each. Same reasoning as
 * `modules/conventions/constants.ts` → `EXTRACTION_TIMEOUT_MS`.
 */
