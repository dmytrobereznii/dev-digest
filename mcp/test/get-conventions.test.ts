import { describe, expect, it } from 'vitest';
import type { ApiConventionCandidate } from '../src/api/schemas.js';
import { ConventionsOutputSchema } from '../src/tools/schemas.js';
import { connectTestServer } from './helpers/connect.js';
import { defaultRoutes, SEEDED_REPO, type Routes } from './helpers/fake-api.js';

const CONVENTIONS_PATH = `/repos/${SEEDED_REPO.id}/conventions`;

describe('T12 — get_conventions', () => {
  it('includes the 3 seeded pending conventions, sorted by confidence', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    const output = ConventionsOutputSchema.parse(result.structuredContent);

    expect(output.total).toBe(3);
    expect(output.conventions).toHaveLength(3);
    expect(output.conventions.every((c) => c.status === 'pending')).toBe(true);
    const confidences = output.conventions.map((c) => c.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
  });

  it('scan: null → next_step naming the extractor', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${CONVENTIONS_PATH}`]: { status: 200, body: { scan: null, candidates: [] } },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    const output = ConventionsOutputSchema.parse(result.structuredContent);
    expect(output.scanned_at).toBeNull();
    expect(output.next_step).toContain('No conventions extracted yet');
  });

  it('a 0-candidate scan → next_step naming a re-run', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${CONVENTIONS_PATH}`]: {
        status: 200,
        body: { scan: { created_at: '2026-01-01T00:00:00.000Z' }, candidates: [] },
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    const output = ConventionsOutputSchema.parse(result.structuredContent);
    expect(output.next_step).toContain('found no conventions');
  });

  it('accepted_only with 0 accepted → next_step', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/payments-api', accepted_only: true },
    });
    const output = ConventionsOutputSchema.parse(result.structuredContent);
    expect(output.conventions).toHaveLength(0);
    expect(output.next_step).toContain('pending candidates');
  });

  it('sanitizes convention fields in actual tool output, not just at the sanitize-unit level', async () => {
    const dirty: ApiConventionCandidate = {
      category: 'sec​urity',
      rule: 'Always use ![img](http://evil.example/x.png) async/await​ here',
      evidence_path: 'src/a.ts\nrm -rf /',
      confidence: 0.9,
      status: 'pending',
    };
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${CONVENTIONS_PATH}`]: {
        status: 200,
        body: { scan: { created_at: '2026-01-01T00:00:00.000Z' }, candidates: [dirty] },
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    const output = ConventionsOutputSchema.parse(result.structuredContent);
    const convention = output.conventions[0]!;

    expect(convention.rule).not.toContain('​');
    expect(convention.rule).toContain('[image: img]');
    expect(convention.category).not.toContain('​');
    expect(convention.evidence_path).not.toContain('\n');
    expect(convention.evidence_path).toBe('src/a.ts rm -rf /');
  });

  it('41 candidates → 40 shown, truncated, total 41', async () => {
    const many: ApiConventionCandidate[] = Array.from({ length: 41 }, (_, i) => ({
      category: 'x',
      rule: `Rule ${i}`,
      evidence_path: `f${i}.ts`,
      confidence: 0.5,
      status: 'pending',
    }));
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${CONVENTIONS_PATH}`]: {
        status: 200,
        body: { scan: { created_at: '2026-01-01T00:00:00.000Z' }, candidates: many },
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    const output = ConventionsOutputSchema.parse(result.structuredContent);
    expect(output.conventions).toHaveLength(40);
    expect(output.truncated).toBe(true);
    expect(output.total).toBe(41);
    expect(output.next_step).toContain('Showing 40 of 41');
  });
});
