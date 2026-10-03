/**
 * Regression: E1/E2/E5/E6 interpolated the caller-supplied `x` placeholder
 * raw, contradicting this file's own header invariant ("every function below
 * that takes one sanitizes it ITSELF ... before interpolating"). `x` is
 * caller-supplied, untrusted text (D13) just like an API-sourced `full_name`
 * or agent `name`, so it goes through the same `sanitizeRepo`/`sanitizeAgent`
 * helpers before being echoed back into the error text.
 */
import { describe, expect, it } from 'vitest';
import { e1, e2, e5, e6 } from '../src/messages.js';

// Bidi override characters (RLO / PDF) that could visually reorder the
// echoed text for a human skimming the tool result; a newline that could
// break a caller parsing the error on a fixed line shape.
const BIDI = '‮evil‬';
const WITH_NEWLINE = 'owner/name\ninjected';

describe('messages — caller-supplied `x` is sanitized before being echoed', () => {
  it('e1 strips bidi override characters from the echoed repo', () => {
    const out = e1(BIDI);
    expect(out).not.toContain('‮');
    expect(out).not.toContain('‬');
  });

  it('e1 collapses a newline in the echoed repo to a single line', () => {
    const out = e1(WITH_NEWLINE);
    expect(out).not.toContain('\n');
    expect(out).toContain('owner/name injected');
  });

  it('e2 strips bidi override characters from the echoed repo', () => {
    const out = e2(BIDI, [], 'http://localhost:3000');
    expect(out).not.toContain('‮');
    expect(out).not.toContain('‬');
  });

  it('e2 collapses a newline in the echoed repo to a single line', () => {
    const out = e2(WITH_NEWLINE, [], 'http://localhost:3000');
    expect(out).not.toContain('\n');
  });

  it('e5 strips bidi override characters from the echoed agent name', () => {
    const out = e5(BIDI);
    expect(out).not.toContain('‮');
    expect(out).not.toContain('‬');
  });

  it('e5 collapses a newline in the echoed agent name', () => {
    const out = e5(WITH_NEWLINE);
    expect(out).not.toContain('\n');
  });

  it('e6 strips bidi override characters from the echoed agent name', () => {
    const out = e6(BIDI, ['Security Reviewer']);
    expect(out).not.toContain('‮');
    expect(out).not.toContain('‬');
  });

  it('e6 collapses a newline in the echoed agent name', () => {
    const out = e6(WITH_NEWLINE, ['Security Reviewer']);
    expect(out).not.toContain('\n');
  });
});
