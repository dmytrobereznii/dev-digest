import { describe, it, expect } from 'vitest';
import { extractReferences, normalizeRepoPath, type RepoIdentity } from './references.js';

const repo: RepoIdentity = { owner: 'acme', name: 'payments-api', prNumber: 482 };

describe('extractReferences — issue references (#N, closes, owner/repo#N)', () => {
  it('resolves a bare #N to an issue', () => {
    const [ref] = extractReferences('Fixes weirdness, see #42 for context.', repo);
    expect(ref).toEqual({ kind: 'issue', ref: '#42', target: { number: 42 } });
  });

  it('resolves "closes #N" (case-insensitive) to the same issue', () => {
    const [ref] = extractReferences('Closes #42.', repo);
    expect(ref).toEqual({ kind: 'issue', ref: 'Closes #42', target: { number: 42 } });
  });

  it('resolves same-repo owner/repo#N', () => {
    const [ref] = extractReferences('See acme/payments-api#42 for the report.', repo);
    expect(ref).toEqual({ kind: 'issue', ref: 'acme/payments-api#42', target: { number: 42 } });
  });

  it('resolves a same-repo github.com issues URL', () => {
    const [ref] = extractReferences(
      'https://github.com/acme/payments-api/issues/42 has the report.',
      repo,
    );
    expect(ref).toMatchObject({ kind: 'issue', target: { number: 42 } });
  });
});

describe('extractReferences — pull and blob URLs', () => {
  it('resolves a same-repo pull URL as kind "pull"', () => {
    const [ref] = extractReferences(
      'Builds on https://github.com/acme/payments-api/pull/7 already merged.',
      repo,
    );
    expect(ref).toEqual({
      kind: 'pull',
      ref: 'https://github.com/acme/payments-api/pull/7',
      target: { number: 7 },
    });
  });

  it('resolves a same-repo blob URL as a repo_file, ignoring the ref segment', () => {
    const [ref] = extractReferences(
      'Plan: https://github.com/acme/payments-api/blob/main/docs/plan.md',
      repo,
    );
    expect(ref).toEqual({
      kind: 'repo_file',
      ref: 'https://github.com/acme/payments-api/blob/main/docs/plan.md',
      target: { path: 'docs/plan.md' },
    });
  });
});

describe('extractReferences — cross-repo', () => {
  it('skips a different-repo issues URL as cross_repo', () => {
    const [ref] = extractReferences(
      'See https://github.com/other-org/other-repo/issues/9 for background.',
      repo,
    );
    expect(ref).toEqual({
      kind: 'issue',
      ref: 'https://github.com/other-org/other-repo/issues/9',
      reason: 'cross_repo',
    });
  });

  it('skips a different-repo owner/repo#N as cross_repo', () => {
    const [ref] = extractReferences('See other-org/other-repo#9 for background.', repo);
    expect(ref).toEqual({ kind: 'issue', ref: 'other-org/other-repo#9', reason: 'cross_repo' });
  });
});

describe('extractReferences — repo files: relative doc paths', () => {
  it('resolves a bare relative path ending in a doc extension', () => {
    const [ref] = extractReferences('Spec lives at docs/plan.md, read it first.', repo);
    expect(ref).toEqual({ kind: 'repo_file', ref: 'docs/plan.md', target: { path: 'docs/plan.md' } });
  });

  it('resolves a markdown link to a relative doc path', () => {
    const [ref] = extractReferences('See the [plan](docs/plan.md) for scope.', repo);
    expect(ref).toEqual({ kind: 'repo_file', ref: 'docs/plan.md', target: { path: 'docs/plan.md' } });
  });

  it('rejects a path that escapes the repo root as outside_repo', () => {
    const [ref] = extractReferences('Do not read [secrets](../../secrets.json).', repo);
    expect(ref).toEqual({ kind: 'repo_file', ref: '../../secrets.json', reason: 'outside_repo' });
  });

  it('rejects a bare ../x.md escape as outside_repo', () => {
    const [ref] = extractReferences('Old plan was at ../x.md.', repo);
    expect(ref).toEqual({ kind: 'repo_file', ref: '../x.md', reason: 'outside_repo' });
  });

  it('rejects a non-allowlisted extension as unsupported_type', () => {
    const [ref] = extractReferences('Config: [env](.env).', repo);
    expect(ref).toEqual({ kind: 'repo_file', ref: '.env', reason: 'unsupported_type' });
  });
});

describe('extractReferences — external links', () => {
  it('marks any other http(s) URL as external, external_not_fetched', () => {
    const [ref] = extractReferences('Design doc: https://example.com/spec', repo);
    expect(ref).toEqual({
      kind: 'external',
      ref: 'https://example.com/spec',
      reason: 'external_not_fetched',
    });
  });

  it('marks a non-http(s) scheme as external, unsupported_type', () => {
    const [ref] = extractReferences('Local copy at file:///Users/me/notes.md', repo);
    expect(ref).toEqual({
      kind: 'external',
      ref: 'file:///Users/me/notes.md',
      reason: 'unsupported_type',
    });
  });
});

describe('extractReferences — dedupe, exclusion, and the cap', () => {
  it('dedupes the same issue mentioned twice into one reference', () => {
    const refs = extractReferences('Closes #42. Also see #42 again.', repo);
    expect(refs).toHaveLength(1);
  });

  it('excludes the PR’s own number entirely', () => {
    const refs = extractReferences('This is PR #482 itself, also see #7.', repo);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ target: { number: 7 } });
  });

  it('resolves at most MAX_REFERENCES and marks the rest limit_reached', () => {
    const body = '#1 #2 #3 #4 #5 #6';
    const refs = extractReferences(body, repo);
    expect(refs).toHaveLength(6);
    const resolved = refs.filter((r) => 'target' in r);
    const skipped = refs.filter((r) => 'reason' in r);
    expect(resolved).toHaveLength(5);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ ref: '#6', reason: 'limit_reached' });
  });
});

describe('normalizeRepoPath', () => {
  it('accepts a plain relative doc path', () => {
    expect(normalizeRepoPath('docs/plan.md')).toEqual({ ok: true, path: 'docs/plan.md' });
  });

  it('rejects an absolute path', () => {
    expect(normalizeRepoPath('/etc/passwd.md')).toEqual({ ok: false, reason: 'outside_repo' });
  });

  it('rejects a ~ path', () => {
    expect(normalizeRepoPath('~/secrets.md')).toEqual({ ok: false, reason: 'outside_repo' });
  });

  it('rejects a backslash path', () => {
    expect(normalizeRepoPath('docs\\plan.md')).toEqual({ ok: false, reason: 'outside_repo' });
  });

  it('rejects any .. escape past the root, even nested', () => {
    expect(normalizeRepoPath('a/../../b.md')).toEqual({ ok: false, reason: 'outside_repo' });
  });

  it('resolves an internal .. that stays inside the root', () => {
    expect(normalizeRepoPath('a/b/../c.md')).toEqual({ ok: true, path: 'a/c.md' });
  });

  it('rejects a non-allowlisted extension', () => {
    expect(normalizeRepoPath('secrets.json')).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});
