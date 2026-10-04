import { z } from 'zod';
import type { BlastRadiusResponse, ChatMessage, Intent, SmartDiffRole } from '@devdigest/shared';
import { Risk } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { renderPrompt } from '../../platform/prompts.js';
import {
  BRIEF_PROMPT_TEMPLATE,
  MAX_REVIEW_FOCUS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
} from './constants.js';
import type { LineRange } from './helpers.js';

/**
 * The model dialogue for the brief: the output schema (module-local, with the
 * caps as `.max()`) and the two messages. The request never carries a patch
 * line, only changed ranges as numbers (AC-15, AC-20).
 */

/** What the model returns. `line` is a bare integer: a bad one is dropped by grounding, not reprompted. */
export const BriefOutput = z.object({
  summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
  risks: z.array(Risk).max(MAX_RISKS),
  review_focus: z
    .array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() }))
    .max(MAX_REVIEW_FOCUS),
});
export type BriefOutput = z.infer<typeof BriefOutput>;

export interface BriefFileInput {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  ranges: LineRange[];
}

export interface BriefPromptInput {
  title: string;
  description: string | null;
  files: BriefFileInput[];
  intent: Intent | null;
  blast: BlastRadiusResponse | null;
  documents: Array<{ path: string; content: string }>;
}

/** Same character class `reviewer-core/prompt.ts` strips from a label: controls, line breaks, `<`, `>`, `"`. */
export function sanitizeInline(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}<>"]/gu, '');
}

function fileLine(f: BriefFileInput): string {
  const ranges = f.ranges.length
    ? f.ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(', ')
    : 'none';
  return `- ${sanitizeInline(f.path)} [${f.role}] +${f.additions} -${f.deletions} changed lines: ${ranges}`;
}

function list(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- (none)';
}

function intentBody(intent: Intent): string {
  return [
    `Intent: ${intent.intent}`,
    `In scope:\n${list(intent.in_scope)}`,
    `Out of scope:\n${list(intent.out_of_scope)}`,
  ].join('\n');
}

function blastBody(blast: BlastRadiusResponse): string {
  const symbols = blast.changed_symbols.map(
    (s) => `${sanitizeInline(s.name)} (${sanitizeInline(s.kind)}) in ${sanitizeInline(s.file)}`,
  );
  const callerFiles = [
    ...new Set(blast.downstream.flatMap((d) => d.callers.map((c) => sanitizeInline(c.file)))),
  ].sort();
  return [
    `Summary: ${sanitizeInline(blast.summary)}`,
    `Changed symbols:\n${list(symbols)}`,
    `Files calling them:\n${list(callerFiles)}`,
  ].join('\n');
}

export async function buildBriefMessages(input: BriefPromptInput): Promise<ChatMessage[]> {
  const system = await renderPrompt(BRIEF_PROMPT_TEMPLATE, {
    max_summary_chars: String(MAX_SUMMARY_CHARS),
    max_risks: String(MAX_RISKS),
    max_review_focus: String(MAX_REVIEW_FOCUS),
  });

  const sections: string[] = [
    `## PR title\n${wrapUntrusted('pr-title', input.title)}`,
    `## PR description\n${wrapUntrusted('pr-description', input.description ?? '')}`,
    `## Changed files\n${input.files.map(fileLine).join('\n')}`,
  ];
  if (input.intent) sections.push(`## PR intent\n${wrapUntrusted('pr-intent', intentBody(input.intent))}`);
  if (input.blast) sections.push(`## Blast radius\n${wrapUntrusted('blast-radius', blastBody(input.blast))}`);
  if (input.documents.length > 0) {
    const docs = input.documents
      .map((d) => `### ${sanitizeInline(d.path)}\n${wrapUntrusted('document', d.content)}`)
      .join('\n\n');
    sections.push(`## Project documents\n${docs}`);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: sections.join('\n\n') },
  ];
}
