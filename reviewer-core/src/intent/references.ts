import type { IntentSkipReason, IntentSourceKind } from '@devdigest/shared';
import { DOC_EXTENSIONS, MAX_REFERENCES } from './constants.js';

/**
 * Reference parsing (D5) — PURE. Finds every reference the description makes
 * (issues, pulls, repo files, external links), classifies its kind, dedupes
 * it, excludes the PR's own number, and caps the RESOLVABLE ones at
 * MAX_REFERENCES. Pre-skipped references (cross-repo, outside-repo,
 * unsupported extension, external — never fetched) do not consume that
 * budget: nothing is ever attempted for them. Actually fetching a resolvable
 * reference is I/O and stays in the server's `modules/intent/resolver.ts`.
 */

export interface RepoIdentity {
  owner: string;
  name: string;
  /** The PR's own number — excluded from its own reference list. */
  prNumber: number;
}

/** A reference the caller should still resolve (issue/pull number, or a repo path). */
export interface ResolvableReference {
  kind: IntentSourceKind;
  /** The raw matched text (stored verbatim as IntentSource.ref). */
  ref: string;
  target: { number: number } | { path: string };
}

/** A reference already known to be unusable — no I/O is ever attempted for it. */
export interface SkippedReference {
  kind: IntentSourceKind;
  ref: string;
  reason: IntentSkipReason;
}

export type ExtractedReference = ResolvableReference | SkippedReference;

function isResolvable(entry: ExtractedReference): entry is ResolvableReference {
  return 'target' in entry;
}

export type NormalizedPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'outside_repo' | 'unsupported_type' };

/**
 * The lexical guard from D6.1: POSIX-normalize, reject absolute paths, `~`,
 * backslashes, and any `..` escape past the repo root, and reject any
 * extension not in DOC_EXTENSIONS. Pure — does no filesystem I/O; the actual
 * read (and its own containment check) is `SimpleGitClient.readFile` (D6.4).
 */
export function normalizeRepoPath(p: string): NormalizedPathResult {
  const trimmed = p.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('~') || trimmed.includes('\\')) {
    return { ok: false, reason: 'outside_repo' };
  }
  const parts = trimmed.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return { ok: false, reason: 'outside_repo' };
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  if (stack.length === 0) return { ok: false, reason: 'outside_repo' };
  const normalized = stack.join('/');
  const last = stack[stack.length - 1]!;
  const dotIdx = last.lastIndexOf('.');
  const ext = dotIdx <= 0 ? '' : last.slice(dotIdx).toLowerCase();
  if (!(DOC_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  return { ok: true, path: normalized };
}

// One combined, ordered scan: a GitHub issue/pull/blob URL (protocol
// optional), any other http(s) URL, any other scheme, `closes/fixes/resolves
// #N`, `owner/repo#N`, bare `#N`, a markdown link, or a bare doc-extension
// token. Matches never overlap (a single global regex), and earlier
// alternatives win when more than one could start at the same position.
const REFERENCE_RE = new RegExp(
  [
    String.raw`(?:https?:\/\/)?github\.com\/(?<ghOwner>[\w.-]+)\/(?<ghRepo>[\w.-]+)\/(?<ghKind>issues|pull|blob)\/(?<ghRest>[^\s)\]]+)`,
    String.raw`https?:\/\/\S+`,
    String.raw`[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+`,
    String.raw`\b(?:closes|fixes|resolves)\s+#(?<issueKw>\d+)`,
    String.raw`\b(?<refOwner>[\w.-]+)\/(?<refRepo>[\w.-]+)#(?<issueRepo>\d+)`,
    String.raw`#(?<issueBare>\d+)`,
    String.raw`\[[^\]]*\]\((?<mdPath>[^)\s]+)\)`,
    String.raw`(?<bareDoc>[\w./~-]+\.(?:md|mdx|markdown|txt|rst|adoc))`,
  ].join('|'),
  'gi',
);

function classifyPathOrUrl(target: string, ref: string): ExtractedReference | null {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: 'external', ref, reason: 'external_not_fetched' };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return { kind: 'external', ref, reason: 'unsupported_type' };
  }
  const norm = normalizeRepoPath(decodeURIComponentSafe(trimmed));
  if (!norm.ok) return { kind: 'repo_file', ref, reason: norm.reason };
  return { kind: 'repo_file', ref, target: { path: norm.path } };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function sameRepo(owner: string, name: string, repo: RepoIdentity): boolean {
  return owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();
}

function classify(match: RegExpMatchArray, repo: RepoIdentity): ExtractedReference | null {
  const g = match.groups ?? {};
  const raw = match[0];

  if (g.ghOwner) {
    const isSameRepo = sameRepo(g.ghOwner, g.ghRepo!, repo);
    if (g.ghKind === 'issues' || g.ghKind === 'pull') {
      const numMatch = /^\d+/.exec(g.ghRest!);
      if (!numMatch) return null;
      const number = Number(numMatch[0]);
      const kind: IntentSourceKind = g.ghKind === 'issues' ? 'issue' : 'pull';
      if (!isSameRepo) return { kind, ref: raw, reason: 'cross_repo' };
      if (kind === 'issue' && number === repo.prNumber) return null;
      return { kind, ref: raw, target: { number } };
    }
    // blob: <ref>/<path...> — the ref segment is ignored (D5); ref records the URL.
    if (!isSameRepo) return { kind: 'repo_file', ref: raw, reason: 'cross_repo' };
    const rest = g.ghRest!;
    const slashIdx = rest.indexOf('/');
    const path = slashIdx === -1 ? '' : rest.slice(slashIdx + 1);
    const norm = normalizeRepoPath(decodeURIComponentSafe(path));
    if (!norm.ok) return { kind: 'repo_file', ref: raw, reason: norm.reason };
    return { kind: 'repo_file', ref: raw, target: { path: norm.path } };
  }

  if (g.issueKw !== undefined) {
    const number = Number(g.issueKw);
    if (number === repo.prNumber) return null;
    return { kind: 'issue', ref: raw, target: { number } };
  }

  if (g.refOwner !== undefined) {
    const isSameRepo = sameRepo(g.refOwner, g.refRepo!, repo);
    const number = Number(g.issueRepo);
    if (!isSameRepo) return { kind: 'issue', ref: raw, reason: 'cross_repo' };
    if (number === repo.prNumber) return null;
    return { kind: 'issue', ref: raw, target: { number } };
  }

  if (g.issueBare !== undefined) {
    const number = Number(g.issueBare);
    if (number === repo.prNumber) return null;
    return { kind: 'issue', ref: raw, target: { number } };
  }

  // ref is the href/path itself (not the surrounding `[text](…)` syntax) —
  // it is what the UI shows in mono and what the server resolves.
  if (g.mdPath !== undefined) return classifyPathOrUrl(g.mdPath, g.mdPath);
  if (g.bareDoc !== undefined) return classifyPathOrUrl(g.bareDoc, raw);

  // The two unnamed alternatives (plain http(s) URL / other-scheme URL).
  if (/^https?:\/\//i.test(raw)) return { kind: 'external', ref: raw, reason: 'external_not_fetched' };
  return { kind: 'external', ref: raw, reason: 'unsupported_type' };
}

function referenceIdentity(entry: ExtractedReference): string {
  if (isResolvable(entry)) {
    return 'number' in entry.target
      ? `${entry.kind}:${entry.target.number}`
      : `${entry.kind}:${entry.target.path.toLowerCase()}`;
  }
  return `${entry.kind}:${entry.ref.toLowerCase()}`;
}

/**
 * Parse `text` for references (D5), deduplicated and in order of appearance.
 * At most MAX_REFERENCES resolvable entries are returned as such; the rest
 * are recorded with reason `limit_reached`.
 */
export function extractReferences(text: string, repo: RepoIdentity): ExtractedReference[] {
  const seen = new Set<string>();
  const out: ExtractedReference[] = [];
  let resolvedCount = 0;

  for (const match of text.matchAll(REFERENCE_RE)) {
    const entry = classify(match, repo);
    if (!entry) continue; // excluded (e.g. the PR's own number)
    const identity = referenceIdentity(entry);
    if (seen.has(identity)) continue;
    seen.add(identity);

    if (isResolvable(entry)) {
      if (resolvedCount >= MAX_REFERENCES) {
        out.push({ kind: entry.kind, ref: entry.ref, reason: 'limit_reached' });
        continue;
      }
      resolvedCount += 1;
    }
    out.push(entry);
  }
  return out;
}
