import type { IntentConfidence } from '@devdigest/shared';
import {
  CONFIDENCE_HIGH_CHARS,
  CONFIDENCE_HIGH_DOC_CHARS,
  CONFIDENCE_MEDIUM_CHARS,
} from './constants.js';

/**
 * Confidence (D7) is computed by CODE from the resolved text, never reported
 * by the model — same rule the engine already applies to the review score.
 */

const HEADING_ONLY_RE = /^#{1,6}\s+.*$/;
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

/**
 * Strip HTML comments and any line that carries no content of its own
 * (a bare markdown heading, a bare URL), collapse whitespace. Checkbox lines
 * are kept — they often carry scope.
 */
export function meaningfulText(body: string | null | undefined): string {
  if (!body) return '';
  const withoutComments = body.replace(/<!--[\s\S]*?-->/gs, '');
  const kept = withoutComments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !HEADING_ONLY_RE.test(line) && !URL_ONLY_RE.test(line));
  return kept.join(' ').replace(/\s+/g, ' ').trim();
}

export interface ConfidenceInput {
  /** The PR's own description/body (raw — meaningfulText is applied here). */
  body: string | null | undefined;
  /** Text of every USED linked issue/pull body or repo file (raw). */
  usedDocs: { text: string }[];
}

export interface ConfidenceResult {
  confidence: IntentConfidence;
  documentedChars: number;
}

/** D7's confidence rule: high/medium/low from meaningful character counts. */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const bodyChars = meaningfulText(input.body).length;
  const docChars = input.usedDocs.map((d) => meaningfulText(d.text).length);
  const documentedChars = bodyChars + docChars.reduce((sum, n) => sum + n, 0);
  const anyDocHigh = docChars.some((n) => n >= CONFIDENCE_HIGH_DOC_CHARS);

  const confidence: IntentConfidence =
    documentedChars >= CONFIDENCE_HIGH_CHARS || anyDocHigh
      ? 'high'
      : documentedChars >= CONFIDENCE_MEDIUM_CHARS
        ? 'medium'
        : 'low';

  return { confidence, documentedChars };
}
