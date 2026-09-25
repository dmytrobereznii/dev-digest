/**
 * Test-only wiring (§8): connect a `Client` to `createServer` over
 * `InMemoryTransport.createLinkedPair()`, with config passed directly
 * (bypassing `loadConfig`'s URL/clamp rules, per §8) so tests can set a tiny
 * `pollIntervalMs`/`maxWaitMs`/`findingsWaitMs`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { DevDigestApi } from '../../src/api/client.js';
import type { Config } from '../../src/config.js';
import { createServer } from '../../src/server.js';
import { fakeFetch, type RecordedCall, type Routes } from './fake-api.js';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiUrl: 'http://127.0.0.1:3001',
    webUrl: 'http://localhost:3000',
    pollIntervalMs: 1,
    maxWaitMs: 30,
    findingsWaitMs: 30,
    requestTimeoutMs: 5000,
    syncTimeoutMs: 5000,
    ...overrides,
  };
}

export interface ConnectedTestServer {
  client: Client;
  calls: RecordedCall[];
  config: Config;
}

export async function connectTestServer(
  routes: Routes,
  configOverrides: Partial<Config> = {},
): Promise<ConnectedTestServer> {
  const { fetch: fetchImpl, calls } = fakeFetch(routes);
  const rest = await connectTestServerWithFetch(fetchImpl, configOverrides);
  return { ...rest, calls };
}

/** For a test that needs to simulate a transport-level failure (a rejected
 * `fetch`, e.g. `ECONNREFUSED`) rather than a fake HTTP response. */
export async function connectTestServerWithFetch(
  fetchImpl: typeof fetch,
  configOverrides: Partial<Config> = {},
): Promise<Omit<ConnectedTestServer, 'calls'>> {
  const config = testConfig(configOverrides);
  const api = new DevDigestApi(config, fetchImpl);
  const server = createServer({ api, config });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client, config };
}
