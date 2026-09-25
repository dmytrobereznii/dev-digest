import { describe, expect, it } from 'vitest';
import type { ApiBlast } from '../src/api/schemas.js';
import { BlastRadiusOutputSchema } from '../src/tools/schemas.js';
import { connectTestServer } from './helpers/connect.js';
import { defaultRoutes, SEEDED_BLAST_OK, SEEDED_PR, SEEDED_REPO, type Routes } from './helpers/fake-api.js';

const BLAST_PATH = `/pulls/${String(SEEDED_PR.id)}/blast`;
const WEB_URL = `http://localhost:3000/repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`;

describe('T7 — get_blast_radius', () => {
  it('an ok fixture maps status/fields through, with no next_step', async () => {
    const routes: Routes = { ...defaultRoutes(), [`GET ${BLAST_PATH}`]: { status: 200, body: SEEDED_BLAST_OK } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    expect(result.isError).not.toBe(true);
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.status).toBe('ok');
    expect(output.changed_symbols).toEqual(SEEDED_BLAST_OK.changed_symbols);
    expect(output.downstream).toEqual(SEEDED_BLAST_OK.downstream);
    expect(output.summary).toBe(SEEDED_BLAST_OK.summary);
    expect(output.truncated).toBe(false);
    expect(output.next_step).toBeUndefined();
  });

  it('25 downstream groups x 15 callers cap to 20 x 10, truncated with the web-URL next_step', async () => {
    const big: ApiBlast = {
      status: 'ok',
      degraded_reason: null,
      summary: 'many symbols changed',
      truncated: false,
      changed_symbols: [],
      downstream: Array.from({ length: 25 }, (_, i) => ({
        symbol: `sym${i}`,
        callers: Array.from({ length: 15 }, (_, j) => ({
          name: `caller${j}`,
          file: `src/f${j}.ts`,
          line: j + 1,
        })),
        endpoints_affected: [],
        crons_affected: [],
      })),
    };
    const routes: Routes = { ...defaultRoutes(), [`GET ${BLAST_PATH}`]: { status: 200, body: big } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.downstream).toHaveLength(20);
    expect(output.downstream.every((d) => d.callers.length === 10)).toBe(true);
    expect(output.truncated).toBe(true);
    expect(output.next_step).toBe(`Showing the top callers only; the full map is at ${WEB_URL}.`);
  });

  it('strips a zero-width char / newline from relayed text', async () => {
    const dirty: ApiBlast = {
      status: 'ok',
      degraded_reason: null,
      summary: 'ok',
      truncated: false,
      changed_symbols: [{ name: 'foo', file: 'src/a.ts\nrm -rf /', kind: 'function' }],
      downstream: [
        {
          symbol: 'foo',
          callers: [{ name: `bar​`, file: 'src/b.ts', line: 1 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    };
    const routes: Routes = { ...defaultRoutes(), [`GET ${BLAST_PATH}`]: { status: 200, body: dirty } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.changed_symbols[0]!.file).toBe('src/a.ts rm -rf /');
    expect(output.downstream[0]!.callers[0]!.name).not.toContain('​');
    expect(output.downstream[0]!.callers[0]!.name).toBe('bar');
  });

  it('no_changed_files is a non-error result with the open-PR next_step', async () => {
    const degraded: ApiBlast = {
      status: 'degraded',
      degraded_reason: 'no_changed_files',
      summary: '0 symbols changed, no downstream callers found.',
      truncated: false,
      changed_symbols: [],
      downstream: [],
    };
    const routes: Routes = { ...defaultRoutes(), [`GET ${BLAST_PATH}`]: { status: 200, body: degraded } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    expect(result.isError).not.toBe(true);
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.status).toBe('degraded');
    expect(output.next_step).toBe(
      `Open ${WEB_URL} once so DevDigest loads the PR's files, then call get_blast_radius again.`,
    );
  });

  it('no_data (the default fixture) gets the re-analyze next_step', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    expect(result.isError).not.toBe(true);
    const output = BlastRadiusOutputSchema.parse(result.structuredContent);
    expect(output.status).toBe('degraded');
    expect(output.degraded_reason).toBe('no_data');
    expect(output.next_step).toBe(
      `Index is no_data: treat missing callers as unknown, not absent. Re-analyze the repo in DevDigest at ${WEB_URL}.`,
    );
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
