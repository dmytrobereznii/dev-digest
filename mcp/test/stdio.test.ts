/**
 * T15: spawns the REAL entry point (`tsx src/index.ts`) over stdio, with no
 * DevDigest API running, to catch any stray stdout write at startup — a
 * single corrupted byte on that channel breaks every JSON-RPC message.
 * `StdioClientTransport` passes only HOME/LOGNAME/PATH/SHELL/TERM/USER plus
 * whatever `env` this test supplies (merged in by the SDK itself).
 */
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const TSX_BIN = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
const ENTRY_POINT = fileURLToPath(new URL('../src/index.ts', import.meta.url));

describe('T15 — stdio entry point', () => {
  it('lists exactly 5 tools with no API running, and writes nothing bad to stdout', async () => {
    const transport = new StdioClientTransport({
      command: TSX_BIN,
      args: [ENTRY_POINT],
      env: {
        // A valid loopback origin (D12) that nothing is listening on — the
        // point is that the server starts and speaks clean stdio JSON-RPC
        // even though every tool call against it would eventually fail.
        DEVDIGEST_API_URL: 'http://127.0.0.1:39999',
      },
    });
    const client = new Client({ name: 'stdio-test-client', version: '0.0.0' });

    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
    } finally {
      await client.close();
    }
  }, 20000);
});
