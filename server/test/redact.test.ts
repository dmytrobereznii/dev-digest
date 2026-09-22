/**
 * redactUrlCredentials — the guard that keeps a GitHub PAT out of `jobs.error`.
 *
 * The strings below are the shapes `simple-git` actually surfaces: it passes
 * git's stderr through verbatim, and git quotes the remote URL — which carries
 * `x-access-token:<PAT>@` — in several of its failure messages.
 */
import { describe, it, expect } from 'vitest';
import { redactUrlCredentials } from '../src/platform/redact.js';
import { withGitHubToken } from '../src/modules/repos/helpers.js';

const PAT = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';

describe('redactUrlCredentials', () => {
  it('strips the PAT from a real-shaped clone failure', () => {
    const msg =
      `fatal: unable to access 'https://x-access-token:${PAT}@github.com/acme/payments-api.git/': ` +
      `The requested URL returned error: 403`;
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain(PAT);
    expect(out).toContain('https://***:***@github.com/acme/payments-api.git/');
    // the diagnostic itself has to survive, or the redaction is a regression
    expect(out).toContain('error: 403');
  });

  it('strips it from the multi-line remote-not-found shape too', () => {
    const msg = [
      `Cloning into '/Users/x/.devdigest/workspace/acme/private-repo'...`,
      `remote: Repository not found.`,
      `fatal: repository 'https://x-access-token:${PAT}@github.com/acme/private-repo.git/' not found`,
    ].join('\n');
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain(PAT);
    expect(out).toContain('remote: Repository not found.');
  });

  it('covers whatever withGitHubToken actually produces', () => {
    // Pinned to the real helper rather than a hand-written URL, so a change to
    // how the token is embedded cannot silently escape the redaction.
    const url = withGitHubToken('https://github.com/acme/payments-api.git', PAT);
    expect(url).toContain(PAT);
    expect(redactUrlCredentials(`fatal: unable to access '${url}'`)).not.toContain(PAT);
  });

  it('redacts a bare `https://token@host` form (no password half)', () => {
    expect(redactUrlCredentials(`fatal: https://${PAT}@github.com/a/b.git`)).not.toContain(PAT);
  });

  it('redacts every URL in the message, not just the first', () => {
    const msg = `https://x-access-token:${PAT}@github.com/a/b and https://user:pw@example.com/c`;
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain(PAT);
    expect(out).not.toContain('pw@');
  });

  it('leaves clean text alone', () => {
    const clean = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";
    expect(redactUrlCredentials(clean)).toBe(clean);
  });

  it('does not eat an ordinary colon-at in prose', () => {
    const msg = 'ENOENT: no such file or directory, open /tmp/a:b@c';
    expect(redactUrlCredentials(msg)).toBe(msg);
  });

  it('is safe on the empty string and a non-string thrown value', () => {
    expect(redactUrlCredentials('')).toBe('');
    expect(redactUrlCredentials(undefined as unknown as string)).toBeUndefined();
  });
});
