/**
 * `list_agents` (§6.2) — the only tool with no `inputSchema` (its handler
 * receives just `(extra)`, so a call with no `arguments` succeeds; `{}` would
 * reject it, per the SDK's own zero-arg handling).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ResolveDeps } from '../resolve.js';
import { sanitizeUntrusted } from '../sanitize.js';
import { AGENT_DESCRIPTION_MAX, AGENT_NAME_MAX } from './constants.js';
import { successResult, toErrorResult } from './helpers.js';
import type { ListAgentsOutput } from './schemas.js';

export const NAME = 'list_agents';
export const TITLE = 'List reviewer agents';
export const DESCRIPTION =
  "List DevDigest's reviewer agents: name, what each one checks, model, and whether it is enabled. Call it when the user names a reviewer or asks which reviews exist, to get the exact agent name for run_agent_on_pr or get_findings.";
export const ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function register(server: McpServer, deps: ResolveDeps): void {
  server.registerTool(NAME, { title: TITLE, description: DESCRIPTION, annotations: ANNOTATIONS }, async () => {
    try {
      const agents = await deps.api.listAgents();
      const sorted = [...agents].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const output: ListAgentsOutput = {
        agents: sorted.map((a) => ({
          id: a.id,
          name: sanitizeUntrusted(a.name, AGENT_NAME_MAX, { singleLine: true }),
          description: sanitizeUntrusted(a.description, AGENT_DESCRIPTION_MAX),
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        })),
        total: sorted.length,
      };
      if (sorted.length === 0) {
        output.next_step = `No agents configured; create one in DevDigest at ${deps.config.webUrl}/agents.`;
      }
      return successResult(output);
    } catch (err) {
      // A genuinely unmodeled error (not one of the 4 classes `toErrorResult`
      // maps) rethrows there; the SDK's own handler catch turns it into an
      // equivalent `{isError: true, content:[...]}` (`err.message` as text).
      return toErrorResult(err, deps.config.apiUrl);
    }
  });
}
