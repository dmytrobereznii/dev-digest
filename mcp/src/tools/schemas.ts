/**
 * Output Zod schemas (D15): NOT advertised as `outputSchema` on any tool (the
 * SDK would emit draft-07, which Claude Code 2.1.282 rejects) — these exist
 * only so tests can assert `Schema.parse(result.structuredContent)`. Nothing
 * in `src/tools/*.ts` (other than tests) imports this file for validation;
 * the tool handlers build the plain object directly.
 */
import { z } from 'zod';
import { ApiBlastDegradedReason } from '../api/schemas.js';
import { SEVERITY_ORDER } from './constants.js';

// ---- §6.1 ReviewResult (run_agent_on_pr, get_findings) ---------------------
export const ReviewCounts = z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});

export const ReviewFinding = z.object({
  severity: z.enum(SEVERITY_ORDER),
  title: z.string(),
  location: z.string(),
  category: z.string(),
  confidence: z.number(),
  rationale: z.string(),
  suggestion: z.string().nullable().optional(),
});

export const ReviewResultSchema = z.object({
  status: z.enum(['done', 'running']),
  repo: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  agent: z.string().nullable(),
  run_id: z.string(),
  attached_to_existing_run: z.literal(true).optional(),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  counts: ReviewCounts,
  findings: z.array(ReviewFinding),
  dismissed: z.number().int().optional(),
  truncated: z.boolean(),
  cost_usd: z.number().nullable(),
  web_url: z.string(),
  next_step: z.string().optional(),
});
export type ReviewResultOutput = z.infer<typeof ReviewResultSchema>;

// ---- §6.2 list_agents --------------------------------------------------------
export const ListAgentsOutputSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      provider: z.string(),
      model: z.string(),
      enabled: z.boolean(),
    }),
  ),
  total: z.number().int(),
  next_step: z.string().optional(),
});
export type ListAgentsOutput = z.infer<typeof ListAgentsOutputSchema>;

// ---- §6.5 get_conventions -----------------------------------------------------
export const ConventionsOutputSchema = z.object({
  repo: z.string(),
  scanned_at: z.string().nullable(),
  conventions: z.array(
    z.object({
      rule: z.string(),
      category: z.string().nullable(),
      status: z.enum(['accepted', 'pending']),
      evidence_path: z.string(),
      confidence: z.number(),
    }),
  ),
  total: z.number().int(),
  truncated: z.boolean(),
  web_url: z.string(),
  next_step: z.string().optional(),
});
export type ConventionsOutput = z.infer<typeof ConventionsOutputSchema>;

// ---- §6.6 get_blast_radius ------------------------------------------------
export const BlastRadiusOutputSchema = z.object({
  status: z.enum(['ok', 'degraded', 'not_implemented']),
  repo: z.string(),
  pr_number: z.number().int(),
  changed_symbols: z.array(
    z.object({ name: z.string(), file: z.string(), kind: z.string() }),
  ),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(
        z.object({ name: z.string(), file: z.string(), line: z.number().int() }),
      ),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  summary: z.string(),
  degraded_reason: ApiBlastDegradedReason.nullable(),
  truncated: z.boolean(),
  next_step: z.string().optional(),
});
export type BlastRadiusOutput = z.infer<typeof BlastRadiusOutputSchema>;
