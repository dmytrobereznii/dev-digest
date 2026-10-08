import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** How confident the code is in a derived Intent — computed, never model-reported (D7). */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** Which inputs had content and fed a derived Intent (D7). */
export const IntentSignal = z.enum([
  'title',
  'description',
  'linked_docs',
  'commits',
  'branch',
  'file_paths',
  'diff',
]);
export type IntentSignal = z.infer<typeof IntentSignal>;

/** What kind of reference a resolved/skipped IntentSource points at (D5). */
export const IntentSourceKind = z.enum(['issue', 'pull', 'repo_file', 'external']);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** Why a reference was skipped instead of resolved (D5/D6/D9). */
export const IntentSkipReason = z.enum([
  'external_not_fetched',
  'cross_repo',
  'outside_repo',
  'unsupported_type',
  'not_found',
  'no_clone',
  'github_unavailable',
  'fetch_failed',
  'limit_reached',
]);
export type IntentSkipReason = z.infer<typeof IntentSkipReason>;

/** One reference discovered while deriving Intent — resolved or skipped, with audit fields. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: z.enum(['used', 'skipped']),
  reason: IntentSkipReason.nullable(),
  title: z.string().nullable(),
  chars: z.number().int().nullable(),
  truncated: z.boolean(),
});
export type IntentSource = z.infer<typeof IntentSource>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

/** Why a blast-radius read is `degraded` (spec 10 D3) — the facade's own
 *  `DegradedReason` plus the route-level `no_changed_files`. */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'no_changed_files',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastStats = z.object({
  symbols: z.number().int(),
  callers: z.number().int(),
  endpoints: z.number().int(),
  crons: z.number().int(),
});
export type BlastStats = z.infer<typeof BlastStats>;

/** `GET /pulls/:id/blast` response (spec 10 D3). Extends `BlastRadius` — which
 *  stays embedded, unchanged, in `PrBrief` — with the status, cap and
 *  attribution fields the card and the MCP tool need. */
export const BlastRadiusResponse = BlastRadius.extend({
  status: z.enum(['ok', 'degraded']),
  degraded_reason: BlastDegradedReason.nullable(),
  /** The SHA the caller line numbers come from (D7); null with no repo/clone. */
  index_sha: z.string().nullable(),
  stats: BlastStats,
  truncated: z.boolean(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
/** Enum order is the display order: core -> tests -> wiring -> docs -> boilerplate. */
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
/** One "read this first" entry: a changed file, a line in it, and why. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/** `intent` and `blast` record what the model was told; null when missing. */
export const PrBrief = z.object({
  summary: z.string(),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

/** An input a generation ran without. */
export const BriefMissingInput = z.enum(['intent', 'blast', 'specs']);
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

/** What `pr_brief.json` holds: the brief plus its generation data. */
export const PrBriefStored = PrBrief.extend({
  pr_id: z.string().uuid(),
  head_sha: z.string(),
  generated_at: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  missing_inputs: z.array(BriefMissingInput),
  specs_used: z.array(z.string()),
  dropped: z.object({
    risks: z.number().int(),
    review_focus: z.number().int(),
  }),
});
export type PrBriefStored = z.infer<typeof PrBriefStored>;

/** A stored brief as served: `stale` is computed on read, never stored. */
export const PrBriefRecord = PrBriefStored.extend({
  stale: z.boolean(),
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

/** Response of `GET /pulls/:id/brief` — null when no brief is stored. */
export const PrBriefResponse = z.object({
  brief: PrBriefRecord.nullable(),
  generating: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
