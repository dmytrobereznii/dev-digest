/**
 * T6 — `SimpleGitClient.readFile`'s containment check (D6.4). Builds a real
 * temp dir on disk as the clone root; no git, no DB.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../../../src/adapters/git/simple-git.js';

describe('SimpleGitClient.readFile', () => {
  let cloneDir: string;
  let client: SimpleGitClient;
  const repo = { owner: 'acme', name: 'payments-api' };

  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'simple-git-readfile-'));
    client = new SimpleGitClient(cloneDir);
    await mkdir(join(cloneDir, repo.owner, repo.name, 'docs'), { recursive: true });
    await writeFile(join(cloneDir, repo.owner, repo.name, 'docs', 'plan.md'), '# The plan\n\nDo the thing.');
    // A real file OUTSIDE the clone root entirely, for the symlink case below.
    await writeFile(join(cloneDir, 'secret.txt'), 'sk_live_outside_the_clone');
  });

  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('reads a normal file inside the clone', async () => {
    const text = await client.readFile(repo, 'docs/plan.md');
    expect(text).toBe('# The plan\n\nDo the thing.');
  });

  it('rejects a literal `..` escape', async () => {
    await expect(client.readFile(repo, '../../secret.txt')).rejects.toThrow();
  });

  it('rejects a committed symlink that points outside the clone', async () => {
    const linkPath = join(cloneDir, repo.owner, repo.name, 'docs', 'escape.md');
    await symlink(join(cloneDir, 'secret.txt'), linkPath);
    await expect(client.readFile(repo, 'docs/escape.md')).rejects.toThrow();
  });
});
