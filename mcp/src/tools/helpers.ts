/**
 * Turns a thrown error, or a successful structured object, into the
 * `CallToolResult` the SDK expects (§5.3, D15). An error result carries no
 * `structuredContent` — only `{isError: true, content: [{type: 'text', text}]}`
 * — because D15 means no tool advertises an `outputSchema`, so a client has
 * nothing to validate `structuredContent` against on the error path anyway.
 * A success result carries `structuredContent` PLUS one compact-JSON `text`
 * block of the same object (§6 preamble) — `content` is what every MCP
 * client renders; `structuredContent` is what this package's own tests
 * `Schema.parse()` against.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiHttpError, ApiUnavailableError, ContractMismatchError, ToolError } from '../errors.js';
import * as messages from '../messages.js';
import { sanitizeRelayedError } from './review-result.js';

export function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Maps `ToolError` to its own message, `ApiUnavailableError` to E8,
 * `ContractMismatchError` to E9, and any other `ApiHttpError` to E10 (§5.3).
 * `ApiHttpError` cases the caller already gave a MORE specific message to
 * (E7/E11/E12/E13/E14/E15/E16/E17) are thrown as `ToolError` before reaching
 * here, so this is only ever the generic fallback for the rest.
 * Anything else is a bug, not a modeled failure — it is rethrown so it
 * surfaces instead of being silently swallowed into a generic tool error.
 */
export function toErrorResult(err: unknown, apiUrl: string): CallToolResult {
  if (err instanceof ToolError) return errorResult(err.message);
  if (err instanceof ApiUnavailableError) return errorResult(messages.e8(apiUrl));
  if (err instanceof ContractMismatchError) return errorResult(messages.e9(err.method, err.path));
  if (err instanceof ApiHttpError) {
    return errorResult(messages.e10(err.status, err.code, sanitizeRelayedError(err.message)));
  }
  throw err;
}

export function successResult(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
  };
}
