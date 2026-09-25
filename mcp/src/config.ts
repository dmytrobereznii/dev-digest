/**
 * `loadConfig` turns process env into the typed `Config` the rest of the
 * server depends on. `DEVDIGEST_API_URL` is validated per D12 — a bare
 * loopback origin, WHATWG-normalised, nothing else — because it guards
 * against env mistakes (a typo, a pasted remote URL), not a malicious PR.
 */
import { ConfigError } from './errors.js';

export interface Config {
  apiUrl: string;
  webUrl: string;
  pollIntervalMs: number;
  maxWaitMs: number;
  findingsWaitMs: number;
  requestTimeoutMs: number;
  syncTimeoutMs: number;
}

const DEFAULT_API_URL = 'http://127.0.0.1:3001';
const DEFAULT_WEB_URL = 'http://localhost:3000';

const DEFAULT_MAX_WAIT_S = 900;
const MIN_MAX_WAIT_S = 30;
const MAX_MAX_WAIT_S = 1800;

// Compared against `URL#hostname` after WHATWG normalisation, which keeps
// the brackets on an IPv6 literal (`[::1]`, not `::1`).
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** D12: protocol http(s), hostname exactly one loopback form, no userinfo,
 * no query, no hash, path exactly "/". Anything else throws `ConfigError`. */
function validateApiUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConfigError(`DEVDIGEST_API_URL must be a valid URL; got "${raw}".`);
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ConfigError(`DEVDIGEST_API_URL must use http or https; got "${raw}".`);
  }
  if (!LOOPBACK_HOSTNAMES.has(u.hostname)) {
    throw new ConfigError(
      `DEVDIGEST_API_URL must be a loopback origin (127.0.0.1, [::1] or localhost); got "${raw}".`,
    );
  }
  if (u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') {
    throw new ConfigError(
      `DEVDIGEST_API_URL must carry no userinfo, query or hash; got "${raw}".`,
    );
  }
  if (u.pathname !== '/') {
    throw new ConfigError(`DEVDIGEST_API_URL must have no path beyond "/"; got "${raw}".`);
  }

  return u.origin;
}

function parseWebUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConfigError(`DEVDIGEST_WEB_URL must be a valid URL; got "${raw}".`);
  }
  const href = u.toString();
  return href.endsWith('/') ? href.slice(0, -1) : href;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** D7: `DEVDIGEST_MCP_MAX_WAIT_S` defaults to 900 and is clamped to 30–1800;
 * a missing, empty/whitespace-only, or unparsable value falls back to the
 * default BEFORE clamping — `Number('')` and `Number('   ')` are both `0`,
 * which is finite, so without the blank check they would silently clamp to
 * the 30s floor instead of falling back to 900s. */
function loadMaxWaitS(raw: string | undefined): number {
  const trimmed = raw?.trim();
  const parsed = !trimmed ? DEFAULT_MAX_WAIT_S : Number(trimmed);
  const base = Number.isFinite(parsed) ? parsed : DEFAULT_MAX_WAIT_S;
  return clamp(base, MIN_MAX_WAIT_S, MAX_MAX_WAIT_S);
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const apiUrl = validateApiUrl(env.DEVDIGEST_API_URL ?? DEFAULT_API_URL);
  const webUrl = parseWebUrl(env.DEVDIGEST_WEB_URL ?? DEFAULT_WEB_URL);
  const maxWaitS = loadMaxWaitS(env.DEVDIGEST_MCP_MAX_WAIT_S);

  return {
    apiUrl,
    webUrl,
    pollIntervalMs: 3000,
    maxWaitMs: maxWaitS * 1000,
    findingsWaitMs: 60000,
    requestTimeoutMs: 15000,
    syncTimeoutMs: 60000,
  };
}
