import { describe, it, expect } from 'vitest';
import { computeConfidence, meaningfulText } from './confidence.js';

describe('meaningfulText', () => {
  it('strips HTML comments', () => {
    expect(meaningfulText('Real content.\n<!-- a hidden note -->\nMore content.')).toBe(
      'Real content. More content.',
    );
  });

  it('drops lines that are only a markdown heading', () => {
    expect(meaningfulText('## Summary\nActual body text here.')).toBe('Actual body text here.');
  });

  it('drops lines that are only a URL', () => {
    expect(meaningfulText('https://example.com/spec\nReal content follows.')).toBe(
      'Real content follows.',
    );
  });

  it('keeps checkbox lines — they often carry scope', () => {
    expect(meaningfulText('- [ ] Return 429 with Retry-After header')).toBe(
      '- [ ] Return 429 with Retry-After header',
    );
  });

  it('collapses whitespace', () => {
    expect(meaningfulText('line one\n\n\n   line two   \t with gaps')).toBe(
      'line one line two with gaps',
    );
  });

  it('a template-only body (headings + comments + bare URL, no prose) is empty', () => {
    const template = '# Title\n\n<!-- please fill this in -->\n\nhttps://example.com/template\n';
    expect(meaningfulText(template)).toBe('');
  });

  it('returns "" for null/undefined', () => {
    expect(meaningfulText(null)).toBe('');
    expect(meaningfulText(undefined)).toBe('');
  });
});

describe('computeConfidence — D7 boundaries', () => {
  it('79 meaningful chars → low', () => {
    const body = 'x'.repeat(79);
    const { confidence, documentedChars } = computeConfidence({ body, usedDocs: [] });
    expect(documentedChars).toBe(79);
    expect(confidence).toBe('low');
  });

  it('80 meaningful chars → medium', () => {
    const body = 'x'.repeat(80);
    const { confidence, documentedChars } = computeConfidence({ body, usedDocs: [] });
    expect(documentedChars).toBe(80);
    expect(confidence).toBe('medium');
  });

  it('299 meaningful chars → medium', () => {
    const body = 'x'.repeat(299);
    const { confidence } = computeConfidence({ body, usedDocs: [] });
    expect(confidence).toBe('medium');
  });

  it('300 meaningful chars → high', () => {
    const body = 'x'.repeat(300);
    const { confidence } = computeConfidence({ body, usedDocs: [] });
    expect(confidence).toBe('high');
  });

  it('a 200-char used doc forces high even with a thin body', () => {
    const body = 'short body';
    const usedDocs = [{ text: 'y'.repeat(200) }];
    const { confidence } = computeConfidence({ body, usedDocs });
    expect(confidence).toBe('high');
  });

  it('a 199-char used doc does not alone force high (falls back to the documentedChars sum)', () => {
    const body = ''; // documentedChars is then exactly the doc's 199 chars — under the 300 total
    const usedDocs = [{ text: 'y'.repeat(199) }];
    const { confidence, documentedChars } = computeConfidence({ body, usedDocs });
    expect(documentedChars).toBe(199);
    expect(confidence).toBe('medium');
  });

  it('a template-only body with no docs is low', () => {
    const template = '# Title\n\n<!-- please fill this in -->\n\nhttps://example.com/template\n';
    const { confidence, documentedChars } = computeConfidence({ body: template, usedDocs: [] });
    expect(documentedChars).toBe(0);
    expect(confidence).toBe('low');
  });

  it('sums body and doc chars for the documentedChars total', () => {
    const body = 'x'.repeat(50);
    const usedDocs = [{ text: 'y'.repeat(40) }];
    const { documentedChars, confidence } = computeConfidence({ body, usedDocs });
    expect(documentedChars).toBe(90);
    expect(confidence).toBe('medium');
  });
});
