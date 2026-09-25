import { describe, expect, it } from 'vitest';
import { BlastRadiusOutputSchema } from '../src/tools/schemas.js';
import { connectTestServer } from './helpers/connect.js';
import { defaultRoutes } from './helpers/fake-api.js';

describe('T13 — get_blast_radius', () => {
  it('always returns a non-error not_implemented result that parses against its schema', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    expect(result.isError).not.toBe(true);
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.status).toBe('not_implemented');
    expect(output.changed_symbols).toEqual([]);
    expect(output.downstream).toEqual([]);
  });

  it('an unknown repo still errors forward with E2', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'nope/nope', pr_number: 1 },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toContain('acme/payments-api');
  });
});
