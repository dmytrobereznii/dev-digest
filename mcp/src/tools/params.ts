/**
 * Shared input param builders (§6 "Shared param descriptions"). Every tool
 * that takes `repo`, `pr_number`, `agent`, `min_severity` or `detail` builds
 * it here, so the exact `.describe()` text (and the `pr_number`/`min_severity`
 * coercions, D8) live in one place rather than drifting per tool file. Each
 * tool file still re-exports its own `INPUT_SHAPE` object (the exported
 * constant the budget test reads), built from these.
 */
import { z } from 'zod';
import { AGENT_NAME_MAX, REPO_FULL_NAME_MAX } from './constants.js';

export const REPO_DESCRIPTION = 'GitHub repository as owner/name, e.g. acme/payments-api';
export const PR_NUMBER_DESCRIPTION = 'Pull request number, e.g. 482 (digits only, no #)';
export const AGENT_DESCRIPTION =
  'Reviewer agent name, case-insensitive; a unique part works (e.g. security). An id also works.';
export const MIN_SEVERITY_DESCRIPTION =
  'Lowest severity to include: CRITICAL, WARNING, or SUGGESTION (default: all). counts always cover every severity.';
export const DETAIL_DESCRIPTION =
  'concise (default): up to 15 findings, short rationale, no fixes. full: up to 10 findings with full rationale and suggested fix.';

export function repoParam() {
  return z.string().max(REPO_FULL_NAME_MAX).describe(REPO_DESCRIPTION);
}

/** D8: `482`, `"482"` or `"#482"` all coerce to the number `482`; the
 * advertised JSON Schema type stays `integer` (zod-to-json-schema's default
 * `effectStrategy: "input"` reads the preprocess's TARGET schema). Anything
 * else is left as-is so the target schema's own validation rejects it. */
function coercePrNumber(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^#/, '');
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return value;
}

/** The server's `pull_requests.number` column is Postgres int4 — cap here too
 * so an oversized number fails MCP-side validation with a clear message
 * instead of round-tripping to a 422 from `GET /repos/:id/pulls/:number`. */
export function prNumberParam() {
  return z.preprocess(
    coercePrNumber,
    z.number().int().positive().max(2147483647).describe(PR_NUMBER_DESCRIPTION),
  );
}

export function agentParam() {
  return z.string().max(AGENT_NAME_MAX).describe(AGENT_DESCRIPTION);
}

/** D8: `min_severity` accepts any case; the preprocess upper-cases before the
 * enum check, and every output stays UPPERCASE regardless of input casing. */
function coerceSeverity(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

export function minSeverityParam() {
  return z
    .preprocess(coerceSeverity, z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']))
    .optional()
    .describe(MIN_SEVERITY_DESCRIPTION);
}

export function detailParam() {
  return z.enum(['concise', 'full']).optional().default('concise').describe(DETAIL_DESCRIPTION);
}

/**
 * The hand-off to `registerTool`'s `inputSchema`. The SDK compares whatever
 * raw shape it is given against its own Zod v3/v4 compatibility union
 * (`AnySchema` in `@modelcontextprotocol/sdk/server/zod-compat.js`); doing
 * that against our own zod 3.25 schema instances — even a bare `z.string()`,
 * confirmed by isolating it — makes `tsc` 5.7 give up with "Type
 * instantiation is excessively deep and possibly infinite" (TS2589). That is
 * a real compiler/SDK-typing ceiling, not a defect in these schemas: they
 * build and parse correctly at runtime regardless, `z.infer` on them
 * elsewhere in this file is unaffected, and the SDK validates arguments
 * against the real Zod schema at call time either way (`validateToolInput`).
 * Every tool file routes its `INPUT_SHAPE` through this one cast, and
 * annotates its handler's `args` parameter explicitly (the type this cast
 * erases) rather than relying on inference from `inputSchema`.
 *
 * `unknown` does not work here: `registerTool`'s `inputSchema` generic
 * constraint is `AnySchema | ZodRawShapeCompat | undefined`, which `unknown`
 * does not satisfy (only `any` short-circuits the constraint check), so the
 * return type is deliberately `any`.
 */
export function toInputSchema(shape: Record<string, z.ZodTypeAny>): any {
  return shape;
}
