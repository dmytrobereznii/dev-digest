/**
 * docs adapter — lists and reads Project Context documents straight from a
 * repository's working tree on disk. Runs no git command: the tree is read as
 * it is, so a file added after the last sync is listed immediately.
 *
 * The walk never follows a symlink, skips the indexer's excluded directories,
 * and `read` repeats the realpath containment of `GitClient.readFile`.
 */
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import picomatch from 'picomatch';
import { EXCLUDED_DIRS } from '../../modules/repo-intel/constants.js';

export interface DocumentReader {
  /** Repo-relative POSIX paths under `root` matching the configured pattern, sorted. */
  listPaths(root: string): Promise<string[]>;
  /** Content of a repo-relative path; throws if it resolves outside `root`. */
  read(root: string, path: string): Promise<string>;
}

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);

export class FsDocumentReader implements DocumentReader {
  constructor(private readonly pattern: string) {}

  async listPaths(root: string): Promise<string[]> {
    const isMatch = picomatch(this.pattern, { dot: true });
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        // Dirent reports a symlink as such (not its target): never follow one.
        if (e.isSymbolicLink()) continue;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (EXCLUDED.has(e.name)) continue;
          await walk(join(dir, e.name), relPath);
        } else if (e.isFile() && isMatch(relPath)) {
          out.push(relPath);
        }
      }
    };
    await walk(root, '');
    return out.sort();
  }

  async read(root: string, path: string): Promise<string> {
    const target = join(root, path);
    const [realBase, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (realTarget !== realBase && !realTarget.startsWith(realBase + sep)) {
      throw new Error(`read: "${path}" resolves outside the root`);
    }
    return readFile(target, 'utf8');
  }
}
