/**
 * Slim, own-runtime Zod parsers (D3) — each lists only the fields the MCP
 * reads, and every field's nullability copies the server's shared contract
 * (`@devdigest/shared`) EXACTLY. `src/api/contract-compat.ts` type-checks
 * that at compile time; nothing here imports the shared contracts, so a
 * server-side change fails `npm run typecheck` in `mcp/` rather than
 * silently drifting at runtime.
 *
 * Narrowing (e.g. a null PR `id`) happens AFTER the parse — in
 * `src/resolve.ts` or a tool — never inside these schemas, per D3.
 */
import { z } from 'zod';

// ---- Agents (GET /agents) -------------------------------------------------
export const ApiAgent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type ApiAgent = z.infer<typeof ApiAgent>;

// ---- Repos (GET /repos) ----------------------------------------------------
export const ApiRepo = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type ApiRepo = z.infer<typeof ApiRepo>;

// ---- Pulls (GET /repos/:id/pulls/:number, GET /repos/:id/pulls) -----------
export const ApiPr = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  head_sha: z.string(),
});
export type ApiPr = z.infer<typeof ApiPr>;

// ---- Pull detail (GET /pulls/:id, the refresh call) ------------------------
export const ApiPrDetail = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  head_sha: z.string(),
});
export type ApiPrDetail = z.infer<typeof ApiPrDetail>;

// ---- Review run start (POST /pulls/:id/review) -----------------------------
export const ApiRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ApiRunTarget = z.infer<typeof ApiRunTarget>;

export const ApiRunStart = z.object({
  pr_id: z.string(),
  runs: z.array(ApiRunTarget),
});
export type ApiRunStart = z.infer<typeof ApiRunStart>;

// ---- Active runs (GET /pulls/:id/runs/active) ------------------------------
export const ApiActiveRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type ApiActiveRun = z.infer<typeof ApiActiveRun>;

// ---- Run history (GET /pulls/:id/runs) -------------------------------------
export const ApiRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  ran_at: z.string().nullable(),
  cost_usd: z.number().nullable(),
});
export type ApiRun = z.infer<typeof ApiRun>;

// ---- Reviews + findings (GET /pulls/:id/reviews) ---------------------------
export const ApiFinding = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number(),
  dismissed_at: z.string().nullable(),
});
export type ApiFinding = z.infer<typeof ApiFinding>;

export const ApiReview = z.object({
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  created_at: z.string(),
  findings: z.array(ApiFinding),
});
export type ApiReview = z.infer<typeof ApiReview>;

// ---- Conventions (GET /repos/:id/conventions) ------------------------------
// `scan` is route-local server-side (not in `vendor/shared`), so it is NOT
// compat-checked in `contract-compat.ts` (D3) — only `created_at` is read.
export const ApiConventionCandidate = z.object({
  category: z.string().nullable(),
  rule: z.string(),
  evidence_path: z.string(),
  confidence: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export type ApiConventionCandidate = z.infer<typeof ApiConventionCandidate>;

export const ApiConventionsPage = z.object({
  scan: z.object({ created_at: z.string() }).nullable(),
  candidates: z.array(ApiConventionCandidate),
});
export type ApiConventionsPage = z.infer<typeof ApiConventionsPage>;

// ---- Structured error envelope --------------------------------------------
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
