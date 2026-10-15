import type { EvalExpectation, Finding } from '@devdigest/shared';
import { FALLBACK_CASE_NAME } from './constants.js';

/** Lowercase kebab-case of a finding title; never empty. */
export function caseNameFromTitle(title: string): string {
  const name = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || FALLBACK_CASE_NAME;
}

/** The part of a finding the expectation is typed from. */
export interface ExpectationSource {
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  severity: string;
  category: string;
}

/** Accepted findings must be found again; dismissed ones must not be flagged. */
export function expectationFromFinding(
  finding: ExpectationSource,
  decision: 'accepted' | 'dismissed',
): EvalExpectation {
  return {
    type: decision === 'accepted' ? 'must_find' : 'must_not_flag',
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    title: finding.title,
    severity: finding.severity as EvalExpectation['severity'],
    category: finding.category as EvalExpectation['category'],
  };
}

/** One file's stored patch under its two header lines (parses without `diff --git`). */
export function fragmentForFile(path: string, patch: string): string {
  return `--- a/${path}\n+++ b/${path}\n${patch}`;
}

/** The finding as the grounding gate wants it. */
export function findingForGrounding(f: ExpectationSource & {
  id: string;
  rationale: string;
  confidence: number;
  kind: string | null;
}): Finding {
  return {
    id: f.id,
    severity: f.severity as Finding['severity'],
    category: f.category as Finding['category'],
    title: f.title,
    file: f.file,
    start_line: f.startLine,
    end_line: f.endLine,
    rationale: f.rationale,
    confidence: f.confidence,
    kind: (f.kind as Finding['kind']) ?? 'finding',
  };
}
