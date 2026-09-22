/**
 * Strip credentials out of text before it is persisted or logged.
 *
 * `modules/repos/helpers.ts` embeds the GitHub PAT into the clone URL
 * (`https://x-access-token:<token>@github.com/owner/repo`), which is the
 * standard non-interactive approach and fine on the happy path. The problem is
 * the failure path: `simple-git` surfaces git's stderr verbatim, git's
 * authentication errors can quote the remote URL, and `platform/jobs.ts` writes
 * that message straight into `jobs.error` — a column the polling UI reads back
 * and every database dump contains.
 *
 * Applied where the message is CAPTURED, not where it is displayed: redacting
 * at the display end would leave the token in the database, which is the part
 * that persists.
 *
 * This lives in `platform/` rather than beside `withGitHubToken` because
 * `jobs.ts` is ring 3 and may not import outward into a module
 * (`onion-architecture` § Where does this code go?). It knows nothing about
 * repos — it is text in, text out.
 */

/**
 * Userinfo in a URL: `scheme://user:password@host`. The password half is
 * optional so a bare `https://token@host` form is caught too. Anchored on
 * `://` so it cannot match an ordinary `word:word@word` in prose.
 */
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi;

/** What replaces the credentials. Keeps the message readable as a URL. */
export const REDACTED = '***:***@';

/**
 * Replace the userinfo of every URL in `text` with `***:***`.
 *
 * Returns the input unchanged when there is nothing to redact, and handles a
 * non-string defensively — this runs on an error path, where the value is
 * whatever was thrown.
 */
export function redactUrlCredentials(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text.replace(URL_USERINFO, (_match, scheme: string) => `${scheme}${REDACTED}`);
}
