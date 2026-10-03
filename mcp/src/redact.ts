/**
 * Strip credentials out of text relayed from the API before it reaches a
 * tool result (D13). Every relayed `<error>`/`<message>` is
 * `redactSecrets` FIRST, then `sanitizeUntrusted(…, 500)` (D13) — in that
 * order, so a token that straddles the 500-char cut is masked before it can
 * be sliced in half and left unrecognisable as a token.
 *
 * The userinfo pattern is the server's `platform/redact.ts` `URL_USERINFO`
 * regex, deliberately RE-IMPLEMENTED here rather than imported: nothing
 * crosses packages at runtime (D2), and this file has no server dependency.
 */

/** Userinfo in a URL: `scheme://user:password@host`. Mirrors the server's
 * `platform/redact.ts` exactly (see that file's comment for why). On input
 * with no terminating `@`, this pattern backtracks quadratically at every
 * `scheme://`-shaped start position (measured: 0.78s at 40KB, 17s at 200KB) —
 * `redactSecrets` below bounds the input before this ever runs. */
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi;

/** `redactSecrets` runs on unbounded text relayed from the API or a run
 * error, before any 500-char output cap — bound it here FIRST, before any
 * regex sees it, so a crafted no-`@` input can't force `URL_USERINFO`'s
 * quadratic backtracking. Larger than the 500-char output cap so a token
 * straddling that final cut is still masked (the caller redacts, then caps —
 * see `tools/review-result.ts`'s `sanitizeRelayedError`). */
export const REDACT_INPUT_MAX = 2000;

/**
 * Provider / PAT token shapes that show up in a relayed error message:
 * GitHub PATs (`ghp_`, `gho_`, `github_pat_`) and GitHub App/installation
 * tokens (`ghs_`, `ghu_`, `ghr_`); OpenAI (`sk-proj-`, `sk-svcacct-`,
 * `sk-admin-`, which carry hyphens/underscores inside the key itself);
 * OpenRouter (`sk-or-v1-`); Anthropic (`sk-ant-`); a generic `sk-…` secret
 * 20+ chars long (for any other `sk-` shape); and a raw `Bearer <token>`
 * header value. Every alternative is a fixed prefix followed by a single
 * `+`-quantified character class — no nested quantifiers, so this stays
 * linear in the input length.
 */
const TOKEN_PATTERN =
  /(?:ghp_|gho_|ghs_|ghu_|ghr_|github_pat_|sk-or-v1-|sk-ant-|sk-proj-|sk-svcacct-|sk-admin-)[A-Za-z0-9_-]+|sk-[A-Za-z0-9]{20,}|Bearer \S+/g;

/** Replace URL userinfo and provider/PAT tokens in `text` with `***`. Bounds
 * `text` to `REDACT_INPUT_MAX` chars before either regex runs (see that
 * constant's comment). `URL_USERINFO` can only ever match where both `://`
 * and `@` are present, so skipping it when either is absent keeps the common
 * case (no userinfo at all) linear without changing what gets masked. */
export function redactSecrets(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  const bounded = text.length > REDACT_INPUT_MAX ? text.slice(0, REDACT_INPUT_MAX) : text;
  let out = bounded;
  if (out.includes('://') && out.includes('@')) {
    out = out.replace(URL_USERINFO, (_match, scheme: string) => `${scheme}***:***@`);
  }
  return out.replace(TOKEN_PATTERN, '***');
}
