/**
 * `get_blast_radius` (§6.6, D11) — the output shape is fixed now; the
 * implementation is homework. Today it resolves repo + PR (so a bad
 * identifier still errors forward, E1-E3/E8-E10) and always returns
 * `status: 'not_implemented'` as a non-error result — `isError` would make a
 * model retry a call that can never succeed yet.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { resolvePr, resolveRepo, type ResolveDeps } from '../resolve.js';
import { sanitizeUntrusted } from '../sanitize.js';
import { REPO_FULL_NAME_MAX } from './constants.js';
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
  "Not available yet: always returns status not_implemented with empty lists, so do not call it to answer a question today; use get_findings, or grep for callers. Once built, it maps what a PR's changed code can affect: changed symbols, their callers, and downstream endpoints and crons.";

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

        const output: BlastRadiusOutput = {
          status: 'not_implemented',
          // Defence in depth (D13 didn't originally list `full_name`).
          repo: sanitizeUntrusted(repo.full_name, REPO_FULL_NAME_MAX, { singleLine: true }),
          pr_number: pr.number,
          changed_symbols: [],
          downstream: [],
          summary: 'Blast radius is not available in this DevDigest version.',
          degraded_reason: null,
          truncated: false,
          next_step: 'Use get_findings for the review, or search callers with grep.',
        };
        return successResult(output);
      } catch (err) {
        return toErrorResult(err, deps.config.apiUrl);
      }
    },
  );
}
