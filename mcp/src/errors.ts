/**
 * Error classes for the MCP server (§5.3 of the spec).
 */

/** Thrown by `loadConfig` (D12) on a bad or unsafe `DEVDIGEST_API_URL` /
 * `DEVDIGEST_WEB_URL`, or an env value that cannot be parsed. Caught once, in
 * `src/index.ts`, and turned into a single stderr line + `process.exit(1)`. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * A fully-formatted E1–E18 message (from `src/messages.ts`), thrown by
 * `src/resolve.ts` and, in a later slice, by the tools themselves.
 * `src/tools/helpers.ts` maps this straight to its `.message` — no further
 * formatting happens at the catch site.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * Thrown by `DevDigestApi` (`src/api/client.ts`) when a request never got a
 * response: the fetch rejected (network failure, DNS), timed out
 * (`AbortSignal.timeout`), or refused a redirect (`redirect: 'error'`).
 * `src/tools/helpers.ts` maps this to E8 in a later slice.
 */
export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

/**
 * Thrown by `DevDigestApi` when the API responded but not with 2xx.
 * Classification is by `status` ONLY (D2/§5.1) — `code` is carried through
 * for display (E10) but never used to decide how to handle the error, because
 * the rate-limit 429 body reuses the generic `internal_error` code.
 */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

/**
 * Thrown by `DevDigestApi` when a 2xx response's body does not parse against
 * the slim schema for that call (D3), or — in `src/resolve.ts` — when a
 * parsed `PrMeta`'s `id` is null (the narrowing D3 says happens after the
 * parse). `method`/`path` feed `messages.e9`; `src/tools/helpers.ts` maps
 * this to E9 in a later slice.
 */
export class ContractMismatchError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
  ) {
    super(`Unexpected response shape for ${method} ${path}`);
    this.name = 'ContractMismatchError';
  }
}
