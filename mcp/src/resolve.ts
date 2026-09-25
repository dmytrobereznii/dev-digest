/**
 * `resolveRepo`, `resolvePr` and `resolveAgent` (§5.3/§5.4, D8) — turn the
 * flat GitHub-native arguments a tool receives (`repo`, `pr_number`, `agent`)
 * into the API objects the rest of the flow needs, or throw a `ToolError`
 * carrying the exact E1–E6 text (§6.7) a tool result relays verbatim.
 *
 * All three take the same `deps: { api, config }` a tool gets (D8) — `config`
 * is needed for `webUrl` in E2/E4.
 */
import type { DevDigestApi } from './api/client.js';
import type { ApiAgent, ApiPr, ApiRepo } from './api/schemas.js';
import type { Config } from './config.js';
import { ApiHttpError, ContractMismatchError, ToolError } from './errors.js';
import * as messages from './messages.js';
import { sanitizeUntrusted } from './sanitize.js';
import { REPO_FULL_NAME_MAX } from './tools/constants.js';

export interface ResolveDeps {
  api: DevDigestApi;
  config: Config;
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** Strip a `https://github.com/` prefix, a `.git` suffix and trailing
 * slash(es) — D8. Leaves everything else (incl. a `/pull/N` suffix, which
 * `messages.e1` hints on) untouched. */
function normalizeRepoInput(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

/** Resolve `owner/name` (or a GitHub URL variant of it) to the matching
 * `Repo` DevDigest already knows. E1 on a bad shape, E2 when it's not added. */
export async function resolveRepo(deps: ResolveDeps, repo: string): Promise<ApiRepo> {
  const normalized = normalizeRepoInput(repo);
  if (!REPO_PATTERN.test(normalized)) {
    throw new ToolError(messages.e1(normalized));
  }

  const repos = await deps.api.listRepos();
  const lower = normalized.toLowerCase();
  const match = repos.find((r) => r.full_name.toLowerCase() === lower);
  if (!match) {
    // Defence in depth (D13 didn't originally list `full_name`): every name
    // in the "Known:" list is API-sourced text, so it gets the same cap and
    // strip as anything else echoed back to the model.
    const known = repos.map((r) => sanitizeUntrusted(r.full_name, REPO_FULL_NAME_MAX, { singleLine: true }));
    throw new ToolError(messages.e2(normalized, known, deps.config.webUrl));
  }
  return match;
}

/** A 404 from `GET /repos/:id/pulls/:number`, distinguished from any other
 * HTTP error so only a 404 triggers the sync-and-retry / E3 branches. */
async function fetchPrOr404(
  deps: ResolveDeps,
  repoId: string,
  number: number,
): Promise<ApiPr | 'not_found'> {
  try {
    return await deps.api.getPullByNumber(repoId, number);
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 404) return 'not_found';
    throw err;
  }
}

/**
 * Resolve a PR by its GitHub-native number, scoped to an already-resolved
 * repo (D4/D8). `sync: true` (only `run_agent_on_pr`, per D4/D7) ALWAYS
 * syncs first, then looks up once — not only as a fallback on a 404. `GET
 * /pulls/:id` (`refreshPull`, called right after this) never updates
 * `head_sha`; only the list sync route (`GET /repos/:id/pulls`) does. A
 * sync-on-miss-only lookup would silently review an already-imported PR
 * under a stale SHA whenever it had new commits but no NEW-PR miss to
 * trigger a sync. `sync: false` (every read tool) never reaches for the
 * sync route and fails fast with E3. A parsed PR with a null `id` is a
 * contract mismatch (E9), not a resolution failure — the narrowing D3
 * defers to this layer.
 */
export async function resolvePr(
  deps: ResolveDeps,
  repo: ApiRepo,
  number: number,
  opts: { sync: boolean },
): Promise<ApiPr> {
  if (opts.sync) {
    await deps.api.syncPulls(repo.id);
    const pr = await fetchPrOr404(deps, repo.id, number);
    if (pr === 'not_found') {
      throw new ToolError(messages.e4(number, repo.full_name, deps.config.webUrl));
    }
    if (pr.id == null) {
      throw new ContractMismatchError('GET', `/repos/${repo.id}/pulls/${number}`);
    }
    return pr;
  }

  const pr = await fetchPrOr404(deps, repo.id, number);
  if (pr === 'not_found') {
    throw new ToolError(messages.e3(number, repo.full_name));
  }
  if (pr.id == null) {
    throw new ContractMismatchError('GET', `/repos/${repo.id}/pulls/${number}`);
  }
  return pr;
}

/**
 * D8 agent matching: exact id → case-insensitive exact name → a UNIQUE
 * case-insensitive substring. E5 on no match, E6 on an ambiguous substring.
 * A disabled agent is accepted here — E7 is `run_agent_on_pr`'s check alone.
 */
export async function resolveAgent(deps: ResolveDeps, agent: string): Promise<ApiAgent> {
  const agents = await deps.api.listAgents();

  const byId = agents.find((a) => a.id === agent);
  if (byId) return byId;

  const lower = agent.toLowerCase();
  const byName = agents.find((a) => a.name.toLowerCase() === lower);
  if (byName) return byName;

  const candidates = agents.filter((a) => a.name.toLowerCase().includes(lower));
  if (candidates.length > 1) {
    throw new ToolError(
      messages.e6(
        agent,
        candidates.map((a) => a.name),
      ),
    );
  }
  const [onlyMatch] = candidates;
  if (!onlyMatch) {
    throw new ToolError(messages.e5(agent));
  }
  return onlyMatch;
}
