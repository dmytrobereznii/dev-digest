import type { GitClient, GitHubClient, IntentSkipReason, IntentSource, IntentSourceKind } from '@devdigest/shared';
import { extractReferences, type DeriveIntentDoc, type ExtractedReference, type RepoIdentity } from '@devdigest/reviewer-core';
import { withTimeout } from '../../platform/resilience.js';
import { contentFromAddedPatch } from './helpers.js';
import { MAX_DOC_CHARS, MAX_REFERENCES, REFERENCE_TIMEOUT_MS } from './constants.js';

/**
 * Reference resolution (D5/D6/D9) — the I/O `extractReferences` (reviewer-core,
 * pure) deliberately leaves out. Attempts every resolvable entry the pure pass
 * finds, follows ONE hop into a resolved issue's own body, and turns every
 * per-reference failure into a `skipped` source rather than throwing — a
 * derivation never fails because one reference did (D9).
 */

export interface ResolveInput {
  repo: RepoIdentity;
  prBody: string;
  /** `pr_files` rows — only `path`/`patch` matter here (D6 step 2). */
  files: { path: string; patch: string | null }[];
  /** `repos.clone_path`; `null` → no clone to read from (D6 step 3 → `no_clone`). */
  clonePath: string | null;
  /** `null` when `container.github()` couldn't build a client (no token). */
  github: GitHubClient | null;
  git: GitClient;
}

export interface ResolveResult {
  sources: IntentSource[];
  /** USED docs only, labelled for `wrapUntrusted` (D10) — feeds `deriveIntent`. */
  docs: DeriveIntentDoc[];
}

/**
 * Identity for cross-pass dedupe — mirrors reviewer-core's internal (private)
 * `referenceIdentity`. Re-implemented here because the budget it enforces
 * spans BOTH the PR body and the one hop into linked issue bodies, which a
 * single `extractReferences` call has no way to see.
 */
function identity(entry: ExtractedReference): string {
  if ('target' in entry) {
    return 'number' in entry.target
      ? `${entry.kind}:${entry.target.number}`
      : `${entry.kind}:${entry.target.path.toLowerCase()}`;
  }
  return `${entry.kind}:${entry.ref.toLowerCase()}`;
}

function skipped(kind: IntentSourceKind, ref: string, reason: IntentSkipReason): IntentSource {
  return { kind, ref, status: 'skipped', reason, title: null, chars: null, truncated: false };
}

function used(kind: IntentSourceKind, ref: string, title: string, text: string): IntentSource {
  return { kind, ref, status: 'used', reason: null, title, chars: text.length, truncated: text.length > MAX_DOC_CHARS };
}

/** Best-effort extraction of an HTTP status from an Octokit (or similar) error. */
function httpStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } };
  return e?.status ?? e?.response?.status;
}

export async function resolveIntentSources(input: ResolveInput): Promise<ResolveResult> {
  const seen = new Set<string>();
  const sources: IntentSource[] = [];
  const docs: DeriveIntentDoc[] = [];
  let budget = MAX_REFERENCES;

  async function resolveIssueOrPull(entry: ExtractedReference & { target: { number: number } }): Promise<void> {
    const number = entry.target.number;
    if (!input.github) {
      sources.push(skipped(entry.kind, entry.ref, 'github_unavailable'));
      return;
    }
    let issueBody: string | null = null;
    try {
      const issue = await withTimeout(
        input.github.getIssue({ owner: input.repo.owner, name: input.repo.name }, number),
        REFERENCE_TIMEOUT_MS,
      );
      const text = issue.body ?? '';
      sources.push(used(entry.kind, entry.ref, issue.title, text));
      docs.push({ label: `${entry.kind}:#${number}`, text });
      issueBody = text;
    } catch (err) {
      const status = httpStatus(err);
      sources.push(skipped(entry.kind, entry.ref, status === 404 ? 'not_found' : 'fetch_failed'));
    }
    // One hop only (D5), and only from ISSUES (not pulls) that resolved.
    if (entry.kind === 'issue' && issueBody && issueBody.trim().length > 0) {
      for (const hopEntry of extractReferences(issueBody, input.repo)) {
        await resolveOne(hopEntry);
      }
    }
  }

  async function resolveRepoFile(entry: ExtractedReference & { target: { path: string } }): Promise<void> {
    const path = entry.target.path;
    const added = contentFromAddedPatch(input.files.find((f) => f.path === path)?.patch);
    if (added != null) {
      sources.push(used('repo_file', entry.ref, path, added));
      docs.push({ label: `file:${path}`, text: added });
      return;
    }
    if (!input.clonePath) {
      sources.push(skipped('repo_file', entry.ref, 'no_clone'));
      return;
    }
    try {
      const text = await withTimeout(
        input.git.readFile({ owner: input.repo.owner, name: input.repo.name }, path),
        REFERENCE_TIMEOUT_MS,
      );
      sources.push(used('repo_file', entry.ref, path, text));
      docs.push({ label: `file:${path}`, text });
    } catch {
      sources.push(skipped('repo_file', entry.ref, 'not_found'));
    }
  }

  async function resolveOne(entry: ExtractedReference): Promise<void> {
    const id = identity(entry);
    if (seen.has(id)) return;
    seen.add(id);

    if (!('target' in entry)) {
      // Already pre-skipped by reviewer-core (cross_repo/outside_repo/
      // unsupported_type/external_not_fetched/limit_reached) — no I/O to attempt.
      sources.push(skipped(entry.kind, entry.ref, entry.reason));
      return;
    }
    if (budget <= 0) {
      sources.push(skipped(entry.kind, entry.ref, 'limit_reached'));
      return;
    }
    budget -= 1;

    if ('number' in entry.target) {
      await resolveIssueOrPull(entry as ExtractedReference & { target: { number: number } });
    } else {
      await resolveRepoFile(entry as ExtractedReference & { target: { path: string } });
    }
  }

  for (const entry of extractReferences(input.prBody, input.repo)) {
    await resolveOne(entry);
  }

  return { sources, docs };
}
