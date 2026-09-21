import { z } from 'zod';
import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { renderPrompt } from '../../platform/prompts.js';
import {
  CONVENTIONS_PROMPT_TEMPLATE,
  MAX_FILE_LINES,
  MAX_SAMPLE_CHARS,
  TRUNCATION_NOTE,
} from './constants.js';

/**
 * The model dialogue for convention extraction: the output schema, the sample
 * budget, and the two messages we send.
 *
 * ONE call (D5). Selection is code — the config list plus repo-intel's ranked
 * top-N — so there is no schema for "which files should I look at?", and
 * `CONVENTIONS_SCHEMA_NAME` is the only `schemaName` this module ever sends.
 *
 * Instruction text lives in `src/prompts/conventions.system.md`; the per-request
 * file list is assembled here, which is the split `platform/prompts.ts` states.
 */

/**
 * One rule as the model returns it — NOT a `vendor/shared` contract. It is the
 * model's output shape, not an API shape: the API returns `ConventionCandidate`
 * (with an id and a triage status), and nothing outside this module ever sees
 * this. Adding it to `vendor/shared` would mean editing both vendored copies to
 * describe a value that never crosses the wire.
 *
 * `evidence_snippet` and `evidence_path` are required and non-empty because a
 * rule without quotable evidence is dropped by the gate anyway (D6) — rejecting
 * it at parse time gets the model a repair attempt instead of a silent discard.
 */
export const ExtractedCandidate = z.object({
  rule: z.string().min(1),
  /** `path` or `path:start-end`, relative to the repo root. */
  evidence_path: z.string().min(1),
  evidence_snippet: z.string().min(1),
  /** Optional — the gate defaults a missing confidence to 0.5 (D6). */
  confidence: z.number().optional(),
});
export type ExtractedCandidate = z.infer<typeof ExtractedCandidate>;

export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedCandidate),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/**
 * One file as it was actually SENT — post-truncation. The gate grounds against
 * `content`, not against the file on disk, so "the text we showed the model" and
 * "the text a snippet must be found in" are the same string by construction.
 */
export interface SampledFile {
  path: string;
  content: string;
  /** True when the per-file line budget cut the tail off. */
  truncated: boolean;
}

/** Clip one file body to `MAX_FILE_LINES`, recording whether anything was cut. */
export function truncateFile(path: string, raw: string): SampledFile {
  const lines = raw.split(/\r?\n/);
  if (lines.length <= MAX_FILE_LINES) return { path, content: raw, truncated: false };
  return { path, content: lines.slice(0, MAX_FILE_LINES).join('\n'), truncated: true };
}

/**
 * Drop whole files once the sample exceeds `MAX_SAMPLE_CHARS`.
 *
 * Whole files, in the order the caller supplied them (config files first, then
 * ranked sources): a half-sent file is the one input that makes the model quote
 * text we can no longer ground it against, and the config files are both the
 * smallest and the densest in house style, so they are the last thing to cut.
 */
export function applySampleBudget(files: SampledFile[]): SampledFile[] {
  const kept: SampledFile[] = [];
  let used = 0;
  for (const file of files) {
    const cost = file.content.length;
    if (used + cost > MAX_SAMPLE_CHARS && kept.length > 0) break;
    kept.push(file);
    used += cost;
  }
  return kept;
}

/**
 * The two messages for the extraction call.
 *
 * Every file body is wrapped with `wrapUntrusted` — the same treatment
 * `run-executor` gives a PR description. A repo file is exactly where a prompt
 * injection sits: a comment or a string literal in someone's source is text we
 * are about to hand a model, and nobody read it first (§3.3 step 5).
 */
export async function buildExtractionMessages(files: SampledFile[]): Promise<ChatMessage[]> {
  const system = await renderPrompt(CONVENTIONS_PROMPT_TEMPLATE, {
    file_count: String(files.length),
    file_list: files.map((f) => `- ${f.path}`).join('\n'),
  });

  const body = files
    .map((f) => {
      const note = f.truncated ? ` (${TRUNCATION_NOTE} to the first ${MAX_FILE_LINES} lines)` : '';
      return `### ${f.path}${note}\n${wrapUntrusted(`file:${f.path}`, f.content)}`;
    })
    .join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Sampled files from this repository:\n\n${body}` },
  ];
}
