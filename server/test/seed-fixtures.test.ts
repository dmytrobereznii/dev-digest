import { describe, it, expect } from 'vitest';
import { DEMO_PRS, type DemoPr } from '../src/db/seed-prs/index.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { PrBriefStored } from '@devdigest/shared';
import { DEMO_PR_FILES, DEMO_REVIEW_SUMMARY } from '../src/db/seed.js';
import { seedBrief482 } from '../src/db/seed-brief.js';
import { groundBrief } from '../src/modules/brief/helpers.js';
import {
  EVAL_FIXTURE_CASES,
  EVAL_FIXTURE_RUNS,
  EVAL_PROMPT_V2_ONLY_LINE,
  evalCaseInputDiff,
} from '../src/db/seed-evals.js';
import { groundFindings } from '../src/platform/grounding.js';
import { scoreRun, type ScoredCaseInput } from '../src/modules/eval/scoring.js';

/**
 * Invariants over the demo PR fixtures (`src/db/seed-prs/`).
 *
 * A fixture's `patch` is a STRING. Nothing type-checks its contents, and
 * `parseUnifiedDiff` trusts the `@@ -a,b +c,d @@` header rather than
 * validating it — so a header whose numbers disagree with the body produces
 * wrong hunk ranges in silence. The visible symptom is a seeded finding that
 * fails to anchor in the diff viewer, which no other suite would catch: the
 * unit lane, `tsc`, `eslint` and `depcruise` all stay green.
 *
 * That hazard was documented twice before this file existed (the doc comment
 * on `seed-prs/types.ts` and an entry in `.context/insights/INSIGHTS.md`) and
 * was still miscounted on the next fixture written. This is the same check as
 * an assertion, so it costs nothing to remember.
 *
 * Hermetic: imports the fixtures as data, touches no DB.
 */

interface HunkCount {
  header: string;
  declaredOld: number;
  declaredNew: number;
  actualOld: number;
  actualNew: number;
}

interface PatchTally {
  additions: number;
  deletions: number;
  hunks: HunkCount[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Recompute a patch from its body: `newLines` = context + `+` lines,
 * `oldLines` = context + `-` lines. Deliberately independent of
 * `parseUnifiedDiff` — a parser cannot be its own oracle.
 */
function tally(patch: string): PatchTally {
  const hunks: HunkCount[] = [];
  let additions = 0;
  let deletions = 0;
  let open: { header: string; old: number; new: number } | null = null;
  let ctx = 0;
  let add = 0;
  let del = 0;

  const close = () => {
    if (!open) return;
    hunks.push({
      header: open.header,
      declaredOld: open.old,
      declaredNew: open.new,
      actualOld: ctx + del,
      actualNew: ctx + add,
    });
    additions += add;
    deletions += del;
  };

  for (const line of patch.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (m) {
      close();
      open = {
        header: line.slice(0, line.indexOf('@@', 2) + 2),
        old: m[2] === undefined ? 1 : Number(m[2]),
        new: m[4] === undefined ? 1 : Number(m[4]),
      };
      ctx = add = del = 0;
      continue;
    }
    if (!open) continue;
    if (line.startsWith('+')) add++;
    else if (line.startsWith('-')) del++;
    else ctx++;
  }
  close();
  return { additions, deletions, hunks };
}

/** Mirrors `modules/reviews/diff-loader.ts` → `diffFromPrFiles`. */
function reconstruct(fx: DemoPr): string {
  const parts: string[] = [];
  for (const f of fx.files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parts.join('\n');
}

describe.each(DEMO_PRS.map((fx) => [fx.number, fx] as const))('demo PR #%i', (_number, fx) => {
  const patched = fx.files.filter((f) => f.patch);

  it('declares a hunk header that matches its body', () => {
    for (const f of patched) {
      for (const h of tally(f.patch!).hunks) {
        expect(
          { file: f.path, header: h.header, old: h.actualOld, new: h.actualNew },
          `${f.path} ${h.header}`,
        ).toEqual({
          file: f.path,
          header: h.header,
          old: h.declaredOld,
          new: h.declaredNew,
        });
      }
    }
  });

  it('declares per-file additions/deletions that match its body', () => {
    for (const f of patched) {
      const counted = tally(f.patch!);
      expect({ path: f.path, additions: f.additions, deletions: f.deletions }).toEqual({
        path: f.path,
        additions: counted.additions,
        deletions: counted.deletions,
      });
    }
  });

  it('totals its files — `filesCount` and additions/deletions cover the null-patch ones too', () => {
    expect(fx.filesCount).toBe(fx.files.length);
    expect({
      additions: fx.additions,
      deletions: fx.deletions,
    }).toEqual({
      additions: fx.files.reduce((n, f) => n + f.additions, 0),
      deletions: fx.files.reduce((n, f) => n + f.deletions, 0),
    });
  });

  it('survives the reviewer’s own reconstruction', () => {
    const parsed = parseUnifiedDiff(reconstruct(fx));
    expect(parsed.files.map((f) => f.path).sort()).toEqual(patched.map((f) => f.path).sort());
  });

  it('anchors every seeded finding inside a real hunk', () => {
    if (!fx.review) return;
    const parsed = parseUnifiedDiff(reconstruct(fx));
    for (const finding of fx.review.findings) {
      if (finding.kind && finding.kind !== 'finding') continue; // full-file kinds ground on the file
      const file = parsed.files.find((f) => f.path === finding.file);
      expect(file, `${finding.title}: cites ${finding.file}, which has no patch`).toBeDefined();
      const hit = file!.hunks.some(
        (h) => finding.startLine <= h.newStart + h.newLines - 1 && finding.endLine >= h.newStart,
      );
      const ranges = file!.hunks.map((h) => `${h.newStart}-${h.newStart + h.newLines - 1}`);
      expect(
        hit,
        `${finding.title}: ${finding.file}:${finding.startLine}-${finding.endLine} is outside every hunk (${ranges.join(', ')})`,
      ).toBe(true);
    }
  });
});

describe('the #482 brief fixture (seed-brief.ts)', () => {
  const brief = seedBrief482({ id: '00000000-0000-4000-8000-000000000482', headSha: 'a1b2c3d4e5f6' });

  const REVIEW_SUMMARY = DEMO_REVIEW_SUMMARY;
  const sentences = (s: string) =>
    s
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

  it('the #482 brief fixture passes groundBrief against the seeded patches unchanged', () => {
    const grounded = groundBrief(
      { risks: brief.risks.risks, review_focus: brief.review_focus },
      DEMO_PR_FILES.map((f) => ({ path: f.path, patch: f.patch })),
    );
    expect(grounded.dropped).toEqual({ risks: 0, review_focus: 0 });
    expect(grounded.review_focus).toEqual(brief.review_focus);
    expect(grounded.risks).toEqual(brief.risks.risks);
  });

  it('the #482 brief fixture holds the two risks AC-92 quotes, in order, with kind, severity, title, explanation and file reference', () => {
    expect(brief.risks.risks).toEqual([
      {
        kind: 'security',
        severity: 'high',
        title: 'Auth surface touched',
        explanation:
          'The webhook route now verifies the Stripe signature: verifySignature builds an HMAC from config.stripeSecretKey and compares it with crypto.timingSafeEqual. A bug here changes which webhook payloads are trusted.',
        file_refs: ['src/api/public/webhooks.ts:9-19'],
      },
      {
        kind: 'perf',
        severity: 'medium',
        title: 'In-process buckets grow without bound',
        explanation:
          'The limiter keeps one bucket per client key in a module-level Map and removes entries only in the test seam resetRateLimiter, so memory grows with the number of distinct keys. The key comes from the x-forwarded-for header when present, which the caller controls.',
        file_refs: ['src/middleware/ratelimit.ts:16'],
      },
    ]);
  });

  it('the #482 brief fixture holds the three Review focus entries AC-93 quotes, in order, each on a new-side line of its seeded patch', () => {
    expect(brief.review_focus).toEqual([
      { file: 'src/config.ts', line: 12, reason: 'live Stripe key (sk_live_…) committed in plaintext' },
      { file: 'src/middleware/ratelimit.ts', line: 71, reason: '429 branch sends the reply with no return after it' },
      { file: 'src/api/users.ts', line: 46, reason: 'N+1 query — one orgs lookup and one prefs lookup per user' },
    ]);
    // Independent of groundBrief: each line must be a `+` or context line on the new side.
    for (const item of brief.review_focus) {
      const patch = DEMO_PR_FILES.find((f) => f.path === item.file)?.patch;
      expect(patch, `${item.file} has no seeded patch`).toBeTruthy();
      let newLine = 0;
      let found = false;
      for (const line of patch!.split('\n')) {
        const m = HUNK_RE.exec(line);
        if (m) {
          newLine = Number(m[3]) - 1;
          continue;
        }
        if (line.startsWith('-')) continue;
        newLine++;
        if (newLine === item.line) found = true;
      }
      expect(found, `${item.file}:${item.line} is not on the new side`).toBe(true);
    }
  });

  it('the #482 brief summary is the text AC-94 quotes, at most 400 characters, and shares no sentence with the seeded review summary', () => {
    expect(brief.summary).toBe(
      "Adds a token-bucket rate limiter in front of the public API and applies it to the Stripe webhook route, so unauthenticated clients can no longer flood those endpoints. Limiter settings are added to the shared config, and the user list endpoint now returns each user's organisations and preferences.",
    );
    expect(brief.summary.length).toBe(298);
    expect(brief.summary.length).toBeLessThanOrEqual(400);
    const reviewSentences = new Set(sentences(REVIEW_SUMMARY));
    expect(sentences(brief.summary).filter((s) => reviewSentences.has(s))).toEqual([]);
  });

  it('the #482 brief fixture satisfies PrBriefStored and lists blast and specs as missing', () => {
    expect(PrBriefStored.safeParse(brief).success).toBe(true);
    expect(brief.missing_inputs).toEqual(['blast', 'specs']);
  });
});

describe('the eval fixture (seed-evals.ts)', () => {
  it('every eval fixture expectation survives groundFindings against its case’s input_diff', () => {
    expect(EVAL_FIXTURE_CASES.length).toBeGreaterThan(0);
    for (const c of EVAL_FIXTURE_CASES) {
      const diff = parseUnifiedDiff(evalCaseInputDiff(c.file, c.patch));
      const { kept, dropped } = groundFindings(
        [
          {
            id: c.name,
            severity: 'WARNING',
            category: 'other',
            title: c.title,
            file: c.file,
            start_line: c.startLine,
            end_line: c.endLine,
            rationale: 'fixture expectation',
            confidence: 1,
          } as never,
        ],
        diff,
      );
      expect({ case: c.name, dropped: dropped.map((d) => d.reason) }).toEqual({
        case: c.name,
        dropped: [],
      });
      expect(kept).toHaveLength(1);
    }
  });

  it('each eval fixture run’s stored results and metrics equal scoreRun over its seeded findings', () => {
    for (const run of EVAL_FIXTURE_RUNS) {
      const inputs: ScoredCaseInput[] = run.results.map((r) => {
        const c = EVAL_FIXTURE_CASES.find((x) => x.name === r.case_name)!;
        expect(c, `${r.case_name} has no fixture case`).toBeDefined();
        return {
          case_id: `id-${r.case_name}`,
          case_name: r.case_name,
          expectation: {
            type: c.type,
            file: c.file,
            start_line: c.startLine,
            end_line: c.endLine,
          },
          kept: r.findings,
          dropped: r.dropped,
          duration_ms: r.duration_ms,
          cost_usd: r.cost_usd,
        };
      });
      const scored = scoreRun(inputs);

      expect(
        scored.results.map(({ case_id: _id, ...rest }) => rest),
        `v${run.version} case results`,
      ).toEqual(run.results);
      expect(scored.metrics, `v${run.version} metrics`).toEqual({
        recall: run.recall,
        precision: run.precision,
        citation_accuracy: run.citationAccuracy,
        traces_passed: run.tracesPassed,
        traces_total: run.results.length,
      });
    }
  });

  it('the eval fixture has a must_find case, a must_not_flag case and two completed runs whose agent_version and system_prompt differ', () => {
    const types = EVAL_FIXTURE_CASES.map((c) => c.type);
    expect(types).toContain('must_find');
    expect(types).toContain('must_not_flag');

    expect(EVAL_FIXTURE_RUNS).toHaveLength(2);
    const [a, b] = EVAL_FIXTURE_RUNS;
    expect(a!.version).not.toBe(b!.version);
    expect(a!.prompt).not.toBe(b!.prompt);
    // v1 → v2 is the one-line change the compare view demonstrates.
    expect(b!.prompt).toContain(EVAL_PROMPT_V2_ONLY_LINE);
    expect(a!.prompt).not.toContain(EVAL_PROMPT_V2_ONLY_LINE);
    // Each run covers every case, so it is a complete run.
    for (const run of EVAL_FIXTURE_RUNS) {
      expect(run.results.map((r) => r.case_name).sort()).toEqual(
        EVAL_FIXTURE_CASES.map((c) => c.name).sort(),
      );
    }
  });
});
