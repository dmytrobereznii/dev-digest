/**
 * `DevDigestApi` — the ONLY place that talks HTTP to the DevDigest API (D2).
 * Named methods only, one per endpoint in spec §5.1; no generic
 * `request(path)` export (enforced by keeping the shared logic in a truly
 * private `#request`, off the prototype's own property list). Every call
 * builds `new URL(path, config.apiUrl)`, refuses a redirect
 * (`redirect: 'error'`, D12) and carries an `AbortSignal.timeout`.
 *
 * Errors are classified by HTTP STATUS only, never by the envelope's `code`
 * (a 429 body says `internal_error` — see server INSIGHTS 2026-09-20).
 */
import { z } from 'zod';
import type { Config } from '../config.js';
import { ApiHttpError, ApiUnavailableError, ContractMismatchError } from '../errors.js';
import {
  ApiAgent,
  ApiRepo,
  ApiPr,
  ApiPrDetail,
  ApiRunStart,
  ApiActiveRun,
  ApiRun,
  ApiReview,
  ApiConventionsPage,
  ApiBlast,
  ApiErrorBody,
} from './schemas.js';

export class DevDigestApi {
  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  listAgents(): Promise<ApiAgent[]> {
    return this.#request('GET', '/agents', z.array(ApiAgent), this.config.requestTimeoutMs);
  }

  listRepos(): Promise<ApiRepo[]> {
    return this.#request('GET', '/repos', z.array(ApiRepo), this.config.requestTimeoutMs);
  }

  getPullByNumber(repoId: string, number: number): Promise<ApiPr> {
    return this.#request(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/pulls/${number}`,
      ApiPr,
      this.config.requestTimeoutMs,
    );
  }

  syncPulls(repoId: string): Promise<ApiPr[]> {
    return this.#request(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/pulls`,
      z.array(ApiPr),
      this.config.syncTimeoutMs,
    );
  }

  refreshPull(prId: string): Promise<ApiPrDetail> {
    return this.#request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}`,
      ApiPrDetail,
      this.config.syncTimeoutMs,
    );
  }

  startReview(prId: string, agentId: string): Promise<ApiRunStart> {
    return this.#request(
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      ApiRunStart,
      this.config.requestTimeoutMs,
      { agentId },
    );
  }

  activeRuns(prId: string): Promise<ApiActiveRun[]> {
    return this.#request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/runs/active`,
      z.array(ApiActiveRun),
      this.config.requestTimeoutMs,
    );
  }

  listRuns(prId: string): Promise<ApiRun[]> {
    return this.#request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/runs`,
      z.array(ApiRun),
      this.config.requestTimeoutMs,
    );
  }

  listReviews(prId: string): Promise<ApiReview[]> {
    return this.#request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/reviews`,
      z.array(ApiReview),
      this.config.requestTimeoutMs,
    );
  }

  getConventions(repoId: string): Promise<ApiConventionsPage> {
    return this.#request(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      ApiConventionsPage,
      this.config.requestTimeoutMs,
    );
  }

  getBlast(prId: string): Promise<ApiBlast> {
    return this.#request(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/blast`,
      ApiBlast,
      this.config.requestTimeoutMs,
    );
  }

  async #request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    timeoutMs: number,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(path, this.config.apiUrl);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
    } catch (err) {
      throw new ApiUnavailableError(
        `Request to ${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      let code = 'unknown';
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const parsed = ApiErrorBody.safeParse(await res.json());
        if (parsed.success) {
          code = parsed.data.error.code;
          message = parsed.data.error.message;
        }
      } catch {
        // Non-JSON or empty body: keep the statusText fallback.
      }
      throw new ApiHttpError(res.status, code, message);
    }

    // A failure HERE means the body never made it — an abort, a timeout, or
    // the socket dropping mid-read on an otherwise-2xx response. That is
    // transient (retry-worthy for polling), not a contract violation, so it
    // becomes `ApiUnavailableError`, not `ContractMismatchError`. Only a
    // well-formed body that fails Zod validation below is a contract
    // mismatch.
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new ApiUnavailableError(
        `Reading the response body for ${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ContractMismatchError(method, path);
    }
    return parsed.data;
  }
}
