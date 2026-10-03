import { describe, expect, it } from 'vitest';
import { REDACT_INPUT_MAX, redactSecrets } from '../src/redact.js';
import { sanitizeUntrusted } from '../src/sanitize.js';

// Every token-shaped fixture below is built at runtime (a prefix literal +
// a repeated filler char), never as one contiguous literal — a hand-typed
// `ghp_<36 chars>`/`sk-<20+ chars>` has the real shape of a live secret, and
// a secret-scanner (incl. GitHub push protection) can't tell a test fixture
// from the real thing (bug: mcp INSIGHTS 2026-09-25 / pr-self-review).
describe('redactSecrets', () => {
  it('masks URL userinfo', () => {
    const out = redactSecrets('remote: https://token:abc123@github.com/acme/repo.git');
    expect(out).toBe('remote: https://***:***@github.com/acme/repo.git');
  });

  it('masks a bare-userinfo URL (no password)', () => {
    const token = 'ghp_' + 'a'.repeat(12);
    const out = redactSecrets(`https://${token}@github.com/acme/repo.git`);
    expect(out).not.toContain(token);
    expect(out).toContain('***:***@');
  });

  it('masks a ghp_ token', () => {
    const token = 'ghp_' + '1234567890abcdefghijklmnopqrstuvwxyz'.slice(0, 36);
    const out = redactSecrets(`using token ${token} for auth`);
    expect(out).not.toContain(token);
    expect(out).toContain('***');
  });

  it('masks a gho_ token', () => {
    const token = 'gho_' + 'b'.repeat(36);
    const out = redactSecrets(`token: ${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a github_pat_ token', () => {
    const token = 'github_pat_' + '11ABCDEFG0123456789_abcdefghijklmnop'.slice(0, 36);
    const out = redactSecrets(`token: ${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a ghs_ (GitHub App installation) token', () => {
    const token = 'ghs_' + 'c'.repeat(36);
    const out = redactSecrets(`installation token: ${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a ghu_ (GitHub App user-to-server) token', () => {
    const token = 'ghu_' + 'd'.repeat(36);
    const out = redactSecrets(`user token: ${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a ghr_ (GitHub App refresh) token', () => {
    const token = 'ghr_' + 'e'.repeat(36);
    const out = redactSecrets(`refresh token: ${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a sk-or-v1- token', () => {
    const token = 'sk-or-v1-' + '0123456789abcdef0123456789abcdef'.slice(0, 32);
    const out = redactSecrets(`OPENROUTER_API_KEY=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a sk-ant- token', () => {
    const token = 'sk-ant-api03-' + '0123456789abcdefghijklmnop'.slice(0, 24);
    const out = redactSecrets(`ANTHROPIC_API_KEY=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a sk-proj- token (hyphens/underscores inside the key)', () => {
    const token = 'sk-proj-' + 'A1b2_C3d4-E5f6'.repeat(3);
    const out = redactSecrets(`OPENAI_API_KEY=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a sk-svcacct- token', () => {
    const token = 'sk-svcacct-' + 'A1b2_C3d4-E5f6'.repeat(3);
    const out = redactSecrets(`OPENAI_API_KEY=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a sk-admin- token', () => {
    const token = 'sk-admin-' + 'A1b2_C3d4-E5f6'.repeat(3);
    const out = redactSecrets(`OPENAI_API_KEY=${token}`);
    expect(out).not.toContain(token);
  });

  it('masks a Bearer header value', () => {
    const token = 'abcdef.ghijkl-token';
    const out = redactSecrets(`curl -H "Authorization: Bearer ${token}"`);
    expect(out).not.toContain(`Bearer ${token}`);
    expect(out).toContain('***');
  });

  it('leaves ordinary text untouched', () => {
    const out = redactSecrets('N+1 query in user list endpoint');
    expect(out).toBe('N+1 query in user list endpoint');
  });
});

describe('redact-then-cap pipeline (D13: redact first, then sanitize+cap to 500)', () => {
  it('masks a token that straddles the 500-char cut', () => {
    // The generic `sk-[A-Za-z0-9]{20,}` pattern needs 20+ chars after `sk-`
    // to match. Placed so the cut at char 500 leaves only 7 of its 30 chars.
    const prefix = 'x'.repeat(490);
    const token = `sk-${'a'.repeat(30)}`; // starts at char 491, crosses 500
    const raw = prefix + token;

    const redactedThenCapped = sanitizeUntrusted(redactSecrets(raw), 500);
    expect(redactedThenCapped).not.toContain('sk-aaaa');

    // Capping BEFORE redacting leaves only 7 of the token's 30 trailing
    // chars — too few for the `{20,}` pattern to recognise — so the
    // fragment survives unmasked. This is why the order matters.
    const cappedThenRedacted = redactSecrets(sanitizeUntrusted(raw, 500));
    expect(cappedThenRedacted).toContain('sk-aaaa');
  });

  it('caps at 500 characters', () => {
    const raw = 'y'.repeat(600);
    const out = sanitizeUntrusted(redactSecrets(raw), 500);
    expect(out.length).toBe(500);
  });
});

// Regression: `URL_USERINFO` backtracks quadratically on input with no
// terminating `@` (measured 0.78s at 40KB, 17s at 200KB before the fix).
// `redactSecrets` runs on unbounded relayed API/run error text ahead of the
// 500-char output cap, so it must bound its OWN input first.
describe('redactSecrets — ReDoS guard (bounded input, no terminating @)', () => {
  it('redacts a 200KB string with no `@` in well under 100ms', () => {
    // 4 chars * 50,000 = 200,000 chars: many `scheme://`-shaped start
    // positions, no `@` anywhere, and no whitespace/slash/colon to stop the
    // greedy class short — the worst case for the old unbounded regex.
    const huge = 'a://'.repeat(50_000);

    const start = performance.now();
    const out = redactSecrets(huge);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(100);
    expect(out.length).toBeLessThanOrEqual(REDACT_INPUT_MAX);
  });

  it('still redacts a real secret sitting inside oversized text', () => {
    const token = 'ghp_' + 'f'.repeat(36);
    const huge = 'x'.repeat(100) + token + 'y'.repeat(100_000);
    const out = redactSecrets(huge);
    expect(out).not.toContain(token);
  });
});
