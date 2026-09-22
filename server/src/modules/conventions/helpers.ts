import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionStatus,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';
import type { ExtractedCandidate } from './prompt.js';
import { DEFAULT_CONFIDENCE } from './constants.js';

/**
 * Pure helpers for the conventions module: row ⇄ DTO mapping, the evidence gate
 * (D6) and the re-scan dedupe key (D3).
 *
 * The MERGE FORMAT is deliberately not here. The modal opens on an editable
 * draft and `POST /repos/:id/conventions/skill` persists whatever body the user
 * submits (D8), so a server-side draft builder could never run without throwing
 * those edits away. It lives in the client, next to the editor that owns it:
 * `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/
 * _components/CreateSkillModal/helpers.ts`.
 *
 * No DB, no filesystem, no `this` — the caller hands in file CONTENTS, which is
 * what lets the gate unit-test without Docker and without a clone. That split is
 * the point: the gate is the part of this feature most worth testing and the
 * part least in need of I/O.
 */

/** One row of a repo's scan history — route-local shape, not a `vendor/shared`
 *  contract: nothing outside the server needs it, and adding one would mean
 *  editing both vendored copies and creating new drift for no gain. */
export interface ConventionScanDto {
  id: string;
  sample_count: number;
  model: string;
  created_at: string;
}

export function toScanDto(row: ConventionScanRow): ConventionScanDto {
  return {
    id: row.id,
    sample_count: row.sampleCount,
    model: row.model,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Map a persisted candidate to the public DTO. `accepted` is read from the
 * column rather than recomputed from `status`: the repository writes the two
 * together (D2), and recomputing here would hide a drift the integration test
 * exists to catch.
 */
export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category ?? null,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: clampConfidence(row.confidence),
    accepted: row.accepted,
    status: row.status as ConventionStatus,
  };
}

// ---- The gate (D6) ---------------------------------------------------------

/** A parsed `evidence_path`. The line hint is optional and never trusted. */
export interface EvidenceRef {
  path: string;
  start?: number;
  end?: number;
}

/** One path segment of a plausible repo-relative path. */
const PATH_SEGMENT = /^[A-Za-z0-9._@~+-]+$/;

/**
 * True for a string that could be a repo-relative path. This is not cosmetic:
 * the next step is `files.get(path)`, and that lookup is only a meaningful
 * membership test if the string is a path at all. An absolute path or a `..`
 * segment is rejected outright — we only ever send repo-relative paths, so a
 * model producing one is either confused or probing.
 */
function isRepoRelativePath(path: string): boolean {
  if (path === '' || path.startsWith('/')) return false;
  return path
    .split('/')
    .every((segment) => segment !== '' && segment !== '..' && PATH_SEGMENT.test(segment));
}

/**
 * Parse `path`, `path:12` or `path:12-20`. Returns null for anything that is not
 * a path — a bare line number, a sentence, an absolute path, a traversal.
 *
 * The trailing `:N`/`:N-M` is stripped greedily-from-the-right, so a path that
 * itself contains a colon fails the segment check rather than being silently
 * mangled into a different path. An `end` below `start` is dropped rather than
 * repaired here: `locateSnippet` recomputes the range from the text anyway, and
 * the hint has already proved unreliable.
 */
export function parseEvidencePath(raw: string): EvidenceRef | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const hint = /^(.+):(\d+)(?:-(\d+))?$/.exec(trimmed);
  const path = (hint?.[1] ?? trimmed).trim();
  if (!isRepoRelativePath(path)) return null;
  if (!hint) return { path };

  const start = Number(hint[2]);
  if (!Number.isInteger(start) || start < 1) return null;
  const end = hint[3] === undefined ? undefined : Number(hint[3]);
  if (end === undefined || end < start) return { path, start };
  return { path, start, end };
}

/** Whitespace-normalised, non-empty lines: what a snippet is compared AS. */
export function normalizeSnippet(snippet: string): string[] {
  return snippet
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

/** A normalised file line, carrying the 1-based number it had in the file. */
interface HayLine {
  text: string;
  line: number;
}

/**
 * From a starting match on `needle[0]`, walk the rest of the needle forward.
 * Returns the index of the last matched hay line, or -1.
 *
 * In ORDER, not necessarily adjacent: a model quoting a function elides the
 * uninteresting middle, and demanding contiguity would discard evidence that is
 * genuinely in the file. Order is still required, which is what stops a bag of
 * lines gathered from all over the file from counting as a quote.
 */
function matchFrom(hay: HayLine[], needle: string[], from: number): number {
  let cursor = from;
  for (let k = 1; k < needle.length; k += 1) {
    let next = -1;
    for (let j = cursor + 1; j < hay.length; j += 1) {
      if (hay[j]!.text === needle[k]) {
        next = j;
        break;
      }
    }
    if (next === -1) return -1;
    cursor = next;
  }
  return cursor;
}

/**
 * Where the snippet actually is in the file, as 1-based inclusive line numbers,
 * or null when it is not there at all. Blank lines are dropped on both sides
 * before matching but the numbers returned are the REAL ones, which is what
 * makes the repaired range citable.
 */
export function locateSnippet(
  lines: string[],
  snippet: string,
): { start: number; end: number } | null {
  const needle = normalizeSnippet(snippet);
  if (needle.length === 0) return null;

  const hay: HayLine[] = [];
  lines.forEach((text, i) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized !== '') hay.push({ text: normalized, line: i + 1 });
  });

  for (let from = 0; from < hay.length; from += 1) {
    if (hay[from]!.text !== needle[0]) continue;
    const end = matchFrom(hay, needle, from);
    if (end !== -1) return { start: hay[from]!.line, end: hay[end]!.line };
  }
  return null;
}

/** `path:12` for one line, `path:12-20` for a range — round-trips `parseEvidencePath`. */
function formatEvidencePath(path: string, range: { start: number; end: number }): string {
  return range.start === range.end ? `${path}:${range.start}` : `${path}:${range.start}-${range.end}`;
}

/** Clamp to [0,1]; a missing or non-numeric confidence becomes 0.5 (D6). */
export function clampConfidence(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONFIDENCE;
  return Math.min(1, Math.max(0, value));
}

/** Drop blank leading/trailing lines while preserving the snippet's indentation. */
function trimBlankEdges(snippet: string): string {
  return snippet.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
}

/** A candidate that passed the gate, with its range repaired from the text. */
export interface GroundedCandidate {
  category: ConventionCategory;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  confidence: number;
}

/**
 * The gate (D6). A candidate survives iff its path parses, the path is one of
 * the files we actually SENT, and its snippet — whitespace-normalised, non-empty
 * lines, in order — occurs in that file.
 *
 * `files` is the sampled set keyed by path, so the membership test in step 1 and
 * the text in step 3 are the same object: there is no way to ground against a
 * file the model was never shown. A citation of an unsent file is invention by
 * construction, and the check costs a `Map.get`.
 *
 * A snippet found somewhere OTHER than the claimed lines has its range REPAIRED
 * from where the text actually is, not discarded. Models quote accurately and
 * count lines badly, and the line number is the one part of the answer we can
 * recompute ourselves — throwing away good evidence over it would be trading the
 * expensive half for the cheap half. A snippet found nowhere is dropped, the
 * same trade `reviewer-core`'s grounding gate makes on findings.
 */
export function groundCandidate(
  candidate: ExtractedCandidate,
  files: ReadonlyMap<string, string>,
): GroundedCandidate | null {
  const rule = candidate.rule.trim();
  if (rule === '') return null;

  const ref = parseEvidencePath(candidate.evidence_path);
  if (!ref) return null;

  const content = files.get(ref.path);
  if (content === undefined) return null;

  const located = locateSnippet(content.split(/\r?\n/), candidate.evidence_snippet);
  if (!located) return null;

  return {
    category: candidate.category,
    rule,
    evidence_path: formatEvidencePath(ref.path, located),
    evidence_snippet: trimBlankEdges(candidate.evidence_snippet),
    confidence: clampConfidence(candidate.confidence),
  };
}

/**
 * The identity of a rule for re-scan suppression (D3): lowercased, backticks
 * removed, every run of punctuation collapsed to one space. Two phrasings of the
 * same rule that differ only in casing or punctuation share a key, so a scan the
 * user has already triaged does not hand back what they settled last time.
 */
export function dedupeKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
