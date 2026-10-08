import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { FsDocumentReader, MAX_DOCUMENT_BYTES } from '../../../src/adapters/docs/index.js';
import { EXCLUDED_DIRS } from '../../../src/modules/repo-intel/constants.js';

const PATTERN = '**/{specs,docs,insights}/**/*.md';

describe('FsDocumentReader', () => {
  let root: string;
  let outside: string;
  const reader = new FsDocumentReader(PATTERN);

  async function put(base: string, rel: string, body = '# x'): Promise<void> {
    const full = join(base, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docs-root-'));
    outside = await mkdtemp(join(tmpdir(), 'docs-outside-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('lists every file matching the pattern', async () => {
    await put(root, 'docs/a.md');
    await put(root, 'server/specs/deep/b.md');
    await put(root, 'insights/c.md');
    await put(root, 'docs/notes.txt'); // wrong extension
    await put(root, 'src/readme.md'); // no specs/docs/insights directory

    expect(await reader.listPaths(root)).toEqual([
      'docs/a.md',
      'insights/c.md',
      'server/specs/deep/b.md',
    ]);
  });

  it('matches directories whose names begin with a dot', async () => {
    await put(root, '.context/specs/plan.md');
    await put(root, 'pkg/.context/docs/ref.md');

    expect(await reader.listPaths(root)).toEqual([
      '.context/specs/plan.md',
      'pkg/.context/docs/ref.md',
    ]);
  });

  it('omits files under every indexer-excluded directory', async () => {
    await put(root, 'docs/keep.md');
    for (const dir of EXCLUDED_DIRS) {
      await put(root, `${dir}/docs/hidden.md`);
      await put(root, `pkg/${dir}/specs/hidden.md`);
    }

    expect(await reader.listPaths(root)).toEqual(['docs/keep.md']);
  });

  it('reads the working tree as it is on disk and runs no git command', async () => {
    // No .git anywhere: a git-backed reader would fail. Files are untracked.
    await put(root, 'docs/first.md', 'one');
    expect(await reader.listPaths(root)).toEqual(['docs/first.md']);

    await put(root, 'docs/second.md', 'two');
    await writeFile(join(root, 'docs/first.md'), 'changed on disk');

    expect(await reader.listPaths(root)).toEqual(['docs/first.md', 'docs/second.md']);
    expect(await reader.read(root, 'docs/first.md')).toBe('changed on disk');
  });

  it('does not list a symlink that points outside the root', async () => {
    await put(outside, 'secret.md', 'TOP SECRET');
    await put(outside, 'dir/inner.md', 'inner');
    await put(root, 'docs/real.md');
    await symlink(join(outside, 'secret.md'), join(root, 'docs/leak.md'));
    await symlink(join(outside, 'dir'), join(root, 'docs/linked-dir'));

    expect(await reader.listPaths(root)).toEqual(['docs/real.md']);
  });

  it('does not list a document larger than the size cap', async () => {
    await put(root, 'docs/at-cap.md', 'a'.repeat(MAX_DOCUMENT_BYTES));
    await put(root, 'docs/over-cap.md', 'a'.repeat(MAX_DOCUMENT_BYTES + 1));

    expect(await reader.listPaths(root)).toEqual(['docs/at-cap.md']);
  });

  it('read rejects a document larger than the size cap', async () => {
    const atCap = 'b'.repeat(MAX_DOCUMENT_BYTES);
    await put(root, 'docs/at-cap.md', atCap);
    await put(root, 'docs/over-cap.md', 'b'.repeat(MAX_DOCUMENT_BYTES + 1));

    expect(await reader.read(root, 'docs/at-cap.md')).toBe(atCap);
    await expect(reader.read(root, 'docs/over-cap.md')).rejects.toThrow(/cap/);
  });

  it('read rejects a path that resolves outside the root', async () => {
    await put(outside, 'secret.md', 'TOP SECRET');
    await put(root, 'docs/real.md', 'fine');
    await symlink(join(outside, 'secret.md'), join(root, 'docs/leak.md'));

    expect(await reader.read(root, 'docs/real.md')).toBe('fine');
    await expect(reader.read(root, 'docs/leak.md')).rejects.toThrow(/outside the root/);
    await expect(reader.read(root, `../${outside.split('/').pop()}/secret.md`)).rejects.toThrow(
      /outside the root/,
    );
  });
});
