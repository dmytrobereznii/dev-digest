import type { PrBriefRecord, PrBriefStored, Risk, ReviewFocusItem } from '@devdigest/shared';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { RISK_KINDS, RISK_KIND_OTHER } from './constants.js';

/**
 * Pure half of the brief module: patch ranges, file-reference parsing, the
 * grounding gate, and the stored-row → API-record mapping. No I/O.
 */

/** Same character class `reviewer-core/prompt.ts` strips from a label: controls, line breaks, `<`, `>`, `"`. */
export function sanitizeInline(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}<>"]/gu, '');
}

/** An inclusive new-side line range. */
export interface LineRange {
  start: number;
  end: number;
}

/** A changed file as grounding sees it. */
export interface ChangedFile {
  path: string;
  patch: string | null | undefined;
}

/** What the model returned, before grounding. `line` is a bare integer here. */
export interface RawBrief {
  risks: Risk[];
  review_focus: ReviewFocusItem[];
}

export interface GroundedBrief {
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  dropped: { risks: number; review_focus: number };
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side range of each hunk header in a patch; a zero-length hunk is skipped. */
export function changedRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const length = m[2] === undefined ? 1 : Number(m[2]);
    if (length === 0) continue;
    ranges.push({ start, end: start + length - 1 });
  }
  return ranges;
}

export interface FileRef {
  path: string;
  start: number | null;
  end: number | null;
}

const REF_SUFFIX_RE = /^(.*):(\d+)(?:-(\d+))?$/;

/** Split `path`, `path:line` or `path:start-end` on its LAST `:n` / `:n-m` suffix. */
export function parseFileRef(ref: string): FileRef {
  const m = REF_SUFFIX_RE.exec(ref);
  if (!m) return { path: ref, start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] === undefined ? start : Number(m[3]);
  return { path: m[1]!, start, end };
}

function overlaps(ranges: LineRange[], start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return ranges.some((r) => lo <= r.end && hi >= r.start);
}

/** A kind outside the known set becomes `other`, so the client never meets an unmapped one. */
export function normalizeRiskKind(kind: string): string {
  const k = kind.trim().toLowerCase();
  return (RISK_KINDS as readonly string[]).includes(k) ? k : RISK_KIND_OTHER;
}

/**
 * Drop everything the model made up. Paths match exactly. A `review_focus` item
 * needs a changed file and a line inside one of its ranges; a risk keeps only
 * references to changed files (a reference whose lines overlap nothing keeps its
 * path alone) and is dropped when none is left. Order is the model's.
 */
export function groundBrief(raw: RawBrief, files: ReadonlyArray<ChangedFile>): GroundedBrief {
  const ranges = new Map(files.map((f) => [f.path, changedRanges(f.patch)]));

  // The model sees sanitised spellings; resolve them back to real paths. A spelling
  // two different files share is ambiguous and matches nothing.
  const bySpelling = new Map<string, string | null>();
  for (const f of files) {
    const shown = sanitizeInline(f.path);
    bySpelling.set(shown, bySpelling.has(shown) && bySpelling.get(shown) !== f.path ? null : f.path);
  }
  const resolve = (spelling: string): string | null => bySpelling.get(spelling) ?? null;

  const focus: ReviewFocusItem[] = [];
  for (const item of raw.review_focus) {
    const real = resolve(item.file);
    const r = real === null ? undefined : ranges.get(real);
    if (real !== null && r && overlaps(r, item.line, item.line)) focus.push({ ...item, file: real });
  }

  const risks: Risk[] = [];
  for (const risk of raw.risks) {
    const refs: string[] = [];
    for (const ref of risk.file_refs) {
      let kept: string | null = null;
      const whole = resolve(ref);
      if (whole !== null) {
        kept = whole;
      } else {
        const parsed = parseFileRef(ref);
        const real = resolve(parsed.path);
        const r = real === null ? undefined : ranges.get(real);
        if (real !== null && r) {
          kept = parsed.start !== null && overlaps(r, parsed.start, parsed.end ?? parsed.start)
            ? `${real}${ref.slice(parsed.path.length)}`
            : real;
        }
      }
      if (kept !== null && !refs.includes(kept)) refs.push(kept);
    }
    if (refs.length > 0) risks.push({ ...risk, kind: normalizeRiskKind(risk.kind), file_refs: refs });
  }

  return {
    risks,
    review_focus: focus,
    dropped: {
      risks: raw.risks.length - risks.length,
      review_focus: raw.review_focus.length - focus.length,
    },
  };
}

/** Blast is usable when it names a changed symbol or the read reported `ok`. */
export function isBlastAvailable(blast: BlastRadiusResponse | null | undefined): blast is BlastRadiusResponse {
  return !!blast && (blast.changed_symbols.length > 0 || blast.status === 'ok');
}

/** Stored JSON → API record; `stale` is computed against the PR's current head. */
export function toRecord(stored: PrBriefStored, pull: { headSha: string }): PrBriefRecord {
  return { ...stored, stale: stored.head_sha !== pull.headSha };
}

/** The one log line a generation writes (NFR-4). */
export function briefLogFields(record: PrBriefStored) {
  return {
    prId: record.pr_id,
    model: record.model,
    tokensIn: record.tokens_in,
    tokensOut: record.tokens_out,
    costUsd: record.cost_usd,
    missingInputs: record.missing_inputs,
    dropped: record.dropped,
  };
}
