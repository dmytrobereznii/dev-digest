import type {
  EvalCaseResult,
  EvalExpectation,
  EvalExpectationType,
  EvalRunFinding,
} from '@devdigest/shared';

/**
 * Pure eval scorer. No I/O, no provider, no clock: the same input always gives
 * the same output. Only the file and the line range of a finding are judged;
 * severity, category, title and confidence are display data.
 */

/** The location part of a finding or an expectation. */
export interface Span {
  file: string;
  start_line: number;
  end_line: number;
}

/** A finding matches an expectation: same file (exact) and ranges sharing a line. */
export function matches(f: Span, e: Span): boolean {
  if (f.file !== e.file) return false;
  const fLo = Math.min(f.start_line, f.end_line);
  const fHi = Math.max(f.start_line, f.end_line);
  const eLo = Math.min(e.start_line, e.end_line);
  const eHi = Math.max(e.start_line, e.end_line);
  return fLo <= eHi && eLo <= fHi;
}

export interface CaseScore {
  expectation_type: EvalExpectationType;
  pass: boolean;
  matched: number;
  /** Surviving findings that matched nothing: neither a TP nor an FP. */
  unjudged: number;
  kept: number;
  dropped: number;
}

/** Score one case: `kept` are the findings that survived grounding. */
export function scoreCase(
  expectation: Pick<EvalExpectation, 'type' | 'file' | 'start_line' | 'end_line'>,
  kept: readonly Span[],
  droppedCount: number,
): CaseScore {
  const matched = kept.filter((f) => matches(f, expectation)).length;
  return {
    expectation_type: expectation.type,
    pass: expectation.type === 'must_find' ? matched >= 1 : matched === 0,
    matched,
    unjudged: kept.length - matched,
    kept: kept.length,
    dropped: droppedCount,
  };
}

/** What the executor hands the scorer for one executed case. */
export interface ScoredCaseInput {
  case_id: string;
  case_name: string;
  expectation: Pick<EvalExpectation, 'type' | 'file' | 'start_line' | 'end_line'>;
  kept: readonly EvalRunFinding[];
  dropped: number;
  duration_ms: number;
  cost_usd: number | null;
}

export interface RunMetrics {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  traces_passed: number;
  traces_total: number;
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

export function scoreRun(cases: readonly ScoredCaseInput[]): {
  results: EvalCaseResult[];
  metrics: RunMetrics;
} {
  let mustFind = 0;
  let mustFindPassed = 0;
  let tp = 0;
  let fp = 0;
  let kept = 0;
  let dropped = 0;
  let passed = 0;

  const results: EvalCaseResult[] = cases.map((c) => {
    const s = scoreCase(c.expectation, c.kept, c.dropped);
    if (s.pass) passed++;
    if (c.expectation.type === 'must_find') {
      mustFind++;
      if (s.pass) mustFindPassed++;
      tp += s.matched;
    } else {
      fp += s.matched;
    }
    kept += s.kept;
    dropped += s.dropped;
    return {
      case_id: c.case_id,
      case_name: c.case_name,
      expectation_type: s.expectation_type,
      pass: s.pass,
      matched: s.matched,
      unjudged: s.unjudged,
      kept: s.kept,
      dropped: s.dropped,
      findings: c.kept.map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        title: f.title,
        severity: f.severity,
        category: f.category,
      })),
      duration_ms: c.duration_ms,
      cost_usd: c.cost_usd,
    };
  });

  return {
    results,
    metrics: {
      recall: ratio(mustFindPassed, mustFind),
      precision: ratio(tp, tp + fp),
      citation_accuracy: ratio(kept, kept + dropped),
      traces_passed: passed,
      traces_total: cases.length,
    },
  };
}
