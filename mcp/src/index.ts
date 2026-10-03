/**
 * Entry point: `tsx src/index.ts` (the `start` script, and what `.mcp.json`
 * launches). Nothing here — or anything it imports — writes to stdout: that
 * channel is the MCP stdio transport, and a stray write to it corrupts every
 * message on the wire. Diagnostics go to stderr only.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DevDigestApi } from './api/client.js';
import { loadConfig, type Config } from './config.js';
import { ConfigError } from './errors.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const server = createServer({ api: new DevDigestApi(config), config });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
