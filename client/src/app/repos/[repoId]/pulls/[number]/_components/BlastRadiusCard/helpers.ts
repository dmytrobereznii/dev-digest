import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastCaller, ChangedSymbol } from "@devdigest/shared";
import { CALLABLE_KINDS } from "./constants";

/** `name()` when `symbol`'s kind (looked up in `changedSymbols` by name) is
    callable (function/method); the bare name otherwise, or when the symbol
    isn't found (D8). */
export function getSymbolLabel(symbol: string, changedSymbols: ChangedSymbol[]): string {
  const match = changedSymbols.find((cs) => cs.name === symbol);
  const callable = match != null && (CALLABLE_KINDS as readonly string[]).includes(match.kind);
  return callable ? `${symbol}()` : symbol;
}

/** GitHub blob URL for a caller, pinned to `sha` (D7: `index_sha ?? headSha`
    at the call site). `null` with no repo full name or no sha — the card
    then renders the caller as plain mono text instead of a link. */
export function getCallerHref(
  repoFullName: string | null,
  sha: string | null,
  caller: BlastCaller,
): string | null {
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, caller.file, caller.line);
}
