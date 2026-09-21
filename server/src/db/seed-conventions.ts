/**
 * L02 seed fixtures — the house rules the Conventions extractor has "already
 * found" for the demo repo, plus the scan row they belong to.
 *
 * Transcribed verbatim from the workshop design bundle
 * (`.context/docs/design/src/data.jsx` → `CONVENTIONS`), which is also where
 * the shape comes from: the design's `evidence_path` / `evidence_snippet` are
 * the DB columns, spelled camelCase here because that is how Drizzle takes them.
 *
 * WHY THE OUTPUT IS SEEDED INSTEAD OF PRODUCED. `acme/payments-api` is inserted
 * with `clonePath: null` and nothing ever clones it, so
 * `POST /repos/:id/conventions/extract` correctly refuses it with a 422 — there
 * is no working tree to read evidence out of. Without these rows a fresh
 * install would open on the empty state behind a button that can only fail, and
 * the browser e2e lane would have nothing to drive: it never makes a model call,
 * so it can assert an extraction's output but never trigger one.
 *
 * These candidates bypass the evidence gate (spec D6) by construction, and that
 * is exactly what they are: the fixtures of a scan that ALREADY RAN, not
 * candidates awaiting verification. Nothing here is a diff, so the
 * "no hand-written hunk headers" warning in the server's INSIGHTS.md does not
 * apply — a snippet is located inside a real file only on the extraction path,
 * which these rows never take.
 *
 * Two rules land green and one amber on purpose. `ConventionCard` colours its
 * confidence bar `var(--ok)` at `>= 0.85` and `var(--warn)` below, so
 * 0.91 / 0.85 / 0.78 puts a value on each side of that boundary — and one
 * exactly on it — on first boot.
 */
import type { ConventionCategory } from '@devdigest/shared';
import { LESSON_AGENT_MODEL } from './seed-skills.js';

/**
 * The design's subtitle reads _"Detected from 84 sample files · last scan 1h
 * ago"_, and `convention_scans.sample_count` is what renders the first half.
 *
 * It is deliberately neither `SEED_CONVENTIONS.length` nor the real pipeline's
 * 12-sources-plus-config budget: a sample count is how many files the scan
 * READ, not how many rules came back, and 84 is the number the artboard shows.
 */
export const CONVENTION_SCAN_SAMPLE_COUNT = 84;

/**
 * The model stamped on the seeded scan, so it claims what a real **Re-scan**
 * would actually run. `FEATURE_MODELS`'s `conventions` entry defaults to
 * `openrouter` / `anthropic/claude-haiku-4.5` (spec D11) — the same slug the
 * two lesson agents use, which is why extraction needs no credential the
 * install does not already require.
 *
 * Aliased off `LESSON_AGENT_MODEL` rather than re-typed so the string exists
 * once. The registry default itself lives in
 * `modules/settings/feature-models.ts`, which `db/` may not import: in the ring
 * model dependencies point inward, `modules/` → `db/`, never back.
 */
export const CONVENTION_SCAN_MODEL = LESSON_AGENT_MODEL;

/**
 * How far in the past to stamp the seeded scan, so the subtitle reads the
 * artboard's _"last scan 1h ago"_ rather than "just now".
 *
 * `convention_scans.created_at` defaults to `now()`, and the client buckets the
 * age into copy (`helpers.scanAge` → `page.relative.hours` at 60 minutes), so a
 * scan written at seed time renders "just now" — true, but not what the design
 * shows. One hour is the smallest offset that reaches the `hours` bucket.
 *
 * This is deliberately an OFFSET, not a frozen timestamp: the row is written
 * once, so a database seeded three days ago correctly reads "3d ago" instead of
 * insisting it was scanned an hour before whenever you happen to look. A
 * hardcoded date would rot; this only ages.
 */
export const CONVENTION_SCAN_AGE_MS = 60 * 60 * 1000;

export interface SeedConvention {
  /** Which kind of house rule this is — the model's closed category set. */
  category: ConventionCategory;
  /** The rule as the model phrased it. Rendered italic, and the natural key. */
  rule: string;
  /** `path:start-end` — the range the gate would have repaired, not invented. */
  evidencePath: string;
  /** Verbatim repo text. The evidence IS the snippet; the range is a hint (D6). */
  evidenceSnippet: string;
  /** `[0, 1]`. `>= 0.85` draws the bar green, below it amber. */
  confidence: number;
}

/**
 * `data.jsx` → `CONVENTIONS`, content verbatim. Listed here in confidence DESC
 * — the order `listForRepo` returns them in, so the file reads like the page.
 * (The artboard's own array is 0.91 / 0.78 / 0.85; insert order is not what the
 * page shows, so matching the query's order is the more useful arrangement.)
 */
export const SEED_CONVENTIONS: SeedConvention[] = [
  {
    category: 'error-handling',
    rule: 'Always use async/await instead of .then() chains',
    evidencePath: 'src/api/users.ts:23-31',
    evidenceSnippet:
      'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
    confidence: 0.91,
  },
  {
    category: 'imports',
    rule: 'Redis access goes through src/lib/redis.ts singleton',
    evidencePath: 'src/lib/redis.ts:1-9',
    evidenceSnippet: 'export const redis = new Redis(config.redisUrl);',
    confidence: 0.85,
  },
  {
    category: 'typing',
    rule: 'All public route handlers return typed Result<T, ApiError>',
    evidencePath: 'src/api/public/index.ts:14-20',
    evidenceSnippet: 'function handler(): Result<Item[], ApiError> {\n  return ok(items);\n}',
    confidence: 0.78,
  },
];
