import { describe, expect, it } from 'vitest';
import { sanitizeUntrusted } from '../src/sanitize.js';

describe('sanitizeUntrusted', () => {
  it('strips Unicode tag-block characters', () => {
    // U+E0001 (LANGUAGE TAG) .. a tag-block run spelling nothing visible.
    const tagChar = String.fromCodePoint(0xe0001);
    const out = sanitizeUntrusted(`safe${tagChar}text`, 100);
    expect(out).toBe('safetext');
  });

  it('strips bidi override characters', () => {
    const rlo = '‮'; // RIGHT-TO-LEFT OVERRIDE
    const pdf = '‬'; // POP DIRECTIONAL FORMATTING
    const out = sanitizeUntrusted(`safe${rlo}txet${pdf}text`, 100);
    expect(out).toBe('safetxettext');
  });

  it('strips zero-width and BOM characters', () => {
    const zwsp = '​';
    const bom = '﻿';
    const out = sanitizeUntrusted(`a${zwsp}b${bom}c`, 100);
    expect(out).toBe('abc');
  });

  it('keeps \\n and \\t by default', () => {
    const out = sanitizeUntrusted('line one\nline\ttwo', 100);
    expect(out).toBe('line one\nline\ttwo');
  });

  it('defangs a markdown image link', () => {
    const out = sanitizeUntrusted('See ![evil](http://evil.example/x.png) here', 200);
    expect(out).toBe('See [image: evil] here');
  });

  it('defangs <img and <a tags without touching unrelated tags', () => {
    const out = sanitizeUntrusted('<img src=x onerror=alert(1)> <a href="x">link</a> <article>ok</article>', 200);
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;a');
    expect(out).toContain('<article>ok</article>');
  });

  it('collapses a newline in a single-line field (file/location/evidence_path)', () => {
    const out = sanitizeUntrusted('src/index.ts\nrm -rf /', 100, { singleLine: true });
    expect(out).not.toContain('\n');
    expect(out).toBe('src/index.ts rm -rf /');
  });

  it('caps length per field', () => {
    const out = sanitizeUntrusted('a'.repeat(300), 200);
    expect(out.length).toBe(200);
  });

  it('leaves ordinary text untouched', () => {
    const out = sanitizeUntrusted('N+1 query in user list endpoint', 300);
    expect(out).toBe('N+1 query in user list endpoint');
  });
});
