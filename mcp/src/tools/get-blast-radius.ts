/**
 * `get_blast_radius` (§6.6, spec 10 D10) — maps what a PR's changed code can
 * affect: its changed symbols, their callers, and the downstream endpoints
 * and crons in those callers' files. A thin pass-through over
 * `GET /pulls/:id/blast` (`api.getBlast`), which the server has already
 * derived the status for and capped: this tool sanitizes every relayed
 * string (symbol/caller names, files, endpoints, crons, summary — D13) and
 * re-caps to the smaller MCP limits (`BLAST_MAX_CHANGED_SYMBOLS` /
 * `BLAST_MAX_DOWNSTREAM` / `BLAST_MAX_CALLERS`), keeping the route's rank
 * order. `status: 'not_implemented'` stays in the output enum, unused — the
 * route never returns it.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { resolvePr, resolveRepo, type ResolveDeps } from '../resolve.js';
import { sanitizeUntrusted } from '../sanitize.js';
import {
  BLAST_MAX_CALLERS,
  BLAST_MAX_CHANGED_SYMBOLS,
  BLAST_MAX_DOWNSTREAM,
  FILE_MAX,
  REPO_FULL_NAME_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
} from './constants.js';
import { successResult, toErrorResult } from './helpers.js';
import { prNumberParam, repoParam, toInputSchema } from './params.js';
import type { BlastRadiusOutput } from './schemas.js';

/** The type `INPUT_SHAPE` erases going through `toInputSchema` (params.ts).
 * Exported so `args-compat.ts` can check it against `z.infer<INPUT_SHAPE>`. */
export interface Args {
  repo: string;
  pr_number: number;
}

export const NAME = 'get_blast_radius';
export const TITLE = 'Get PR blast radius';
export const DESCRIPTION =
  "Map what a pull request's changed code can affect: the symbols it changes, their callers (file:line), and the HTTP endpoints and cron jobs in those callers' files. Read-only, precomputed from the repo index, no LLM call. Use it to judge a PR's risk beyond its diff. status is degraded when the index is missing or partial; degraded_reason and next_step say why.";

export const INPUT_SHAPE = {
  repo: repoParam(),
  pr_number: prNumberParam(),
};

export const ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function register(server: McpServer, deps: ResolveDeps): void {
  server.registerTool(
    NAME,
    { title: TITLE, description: DESCRIPTION, inputSchema: toInputSchema(INPUT_SHAPE), annotations: ANNOTATIONS },
    async (args: Args) => {
      try {
        const repo = await resolveRepo(deps, args.repo);
        const pr = await resolvePr(deps, repo, args.pr_number, { sync: false });
        const blast = await deps.api.getBlast(pr.id);

        let capped = false;

        const changedSymbols = blast.changed_symbols.slice(0, BLAST_MAX_CHANGED_SYMBOLS);
        if (blast.changed_symbols.length > BLAST_MAX_CHANGED_SYMBOLS) capped = true;

        const rawDownstream = blast.downstream.slice(0, BLAST_MAX_DOWNSTREAM);
        if (blast.downstream.length > BLAST_MAX_DOWNSTREAM) capped = true;

        const downstream = rawDownstream.map((group) => {
          const callers = group.callers.slice(0, BLAST_MAX_CALLERS);
          if (group.callers.length > BLAST_MAX_CALLERS) capped = true;
          return {
            symbol: sanitizeUntrusted(group.symbol, TITLE_MAX, { singleLine: true }),
            callers: callers.map((c) => ({
              name: sanitizeUntrusted(c.name, TITLE_MAX, { singleLine: true }),
              file: sanitizeUntrusted(c.file, FILE_MAX, { singleLine: true }),
              line: c.line,
            })),
            endpoints_affected: group.endpoints_affected.map((e) =>
              sanitizeUntrusted(e, TITLE_MAX, { singleLine: true }),
            ),
            crons_affected: group.crons_affected.map((c) => sanitizeUntrusted(c, TITLE_MAX, { singleLine: true })),
          };
        });

        const truncated = blast.truncated || capped;
        const webUrl = `${deps.config.webUrl}/repos/${repo.id}/pulls/${pr.number}`;

        const output: BlastRadiusOutput = {
          status: blast.status,
          // Defence in depth (D13 didn't originally list `full_name`).
          repo: sanitizeUntrusted(repo.full_name, REPO_FULL_NAME_MAX, { singleLine: true }),
          pr_number: pr.number,
          changed_symbols: changedSymbols.map((s) => ({
            name: sanitizeUntrusted(s.name, TITLE_MAX, { singleLine: true }),
            file: sanitizeUntrusted(s.file, FILE_MAX, { singleLine: true }),
            kind: s.kind,
          })),
          downstream,
          summary: sanitizeUntrusted(blast.summary, SUMMARY_MAX),
          degraded_reason: blast.degraded_reason,
          truncated,
        };

        if (blast.status === 'degraded') {
          output.next_step =
            blast.degraded_reason === 'no_changed_files'
              ? `Open ${webUrl} once so DevDigest loads the PR's files, then call get_blast_radius again.`
              : `Index is ${blast.degraded_reason ?? 'unknown'}: treat missing callers as unknown, not absent. Re-analyze the repo in DevDigest at ${webUrl}.`;
        } else if (truncated) {
          output.next_step = `Showing the top callers only; the full map is at ${webUrl}.`;
        }

        return successResult(output);
      } catch (err) {
        return toErrorResult(err, deps.config.apiUrl);
      }
    },
  );
}
