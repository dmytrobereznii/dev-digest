import { describe, expect, it } from 'vitest';
import type { ApiFinding, ApiReview, ApiRun } from '../src/api/schemas.js';
import { INPUT_SHAPE } from '../src/tools/get-findings.js';
import * as messages from '../src/messages.js';
import { ReviewResultSchema } from '../src/tools/schemas.js';
import { connectTestServer } from './helpers/connect.js';
import {
  defaultRoutes,
  SEEDED_PR,
  SEEDED_REPO,
  SEEDED_REVIEW,
  SEEDED_RUN_ID,
  type Routes,
} from './helpers/fake-api.js';

const RUN_PATH = `/pulls/${SEEDED_PR.id}/runs`;
const REVIEWS_PATH = `/pulls/${SEEDED_PR.id}/reviews`;

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content;
  return content?.[0]?.text ?? '';
}

function makeRun(overrides: Partial<ApiRun>): ApiRun {
  return {
    run_id: SEEDED_RUN_ID,
    agent_id: 'agent-security',
    agent_name: 'Security Reviewer',
    status: 'done',
    error: null,
    ran_at: '2026-01-01T00:00:00.000Z',
    cost_usd: 0.014,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ApiFinding>): ApiFinding {
  return {
    severity: 'WARNING',
    category: 'x',
    title: 'F',
    file: 'f.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    suggestion: 'fix it',
    confidence: 0.5,
    dismissed_at: null,
    ...overrides,
  };
}

function callParams(args: Record<string, unknown>) {
  return { name: 'get_findings', arguments: { repo: 'acme/payments-api', pr_number: 482, ...args } };
}

describe('T10 — get_findings selection and shaping', () => {
  it('picks the newest done run and names a newer running run in next_step', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [
          makeRun({ run_id: 'run-old-done', status: 'done', ran_at: '2026-01-01T00:00:00.000Z' }),
          makeRun({ run_id: 'run-newer-running', status: 'running', ran_at: '2026-01-02T00:00:00.000Z' }),
        ],
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: 'run-old-done' }] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.run_id).toBe('run-old-done');
    expect(output.next_step).toContain('run-newer-running');
  });

  it('an agent filter scopes what counts as "newer"', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${RUN_PATH}`]: {
        status: 200,
        body: [
          makeRun({
            run_id: 'run-sec-done',
            agent_id: 'agent-security',
            agent_name: 'Security Reviewer',
            status: 'done',
            ran_at: '2026-01-01T00:00:00.000Z',
          }),
          makeRun({
            run_id: 'run-general-running',
            agent_id: 'agent-general',
            agent_name: 'General Reviewer',
            status: 'running',
            ran_at: '2026-01-02T00:00:00.000Z',
          }),
        ],
      },
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, run_id: 'run-sec-done' }] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({ agent: 'security' }));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.run_id).toBe('run-sec-done');
    expect(output.next_step).toBeUndefined();
  });

  it('min_severity is case-insensitive', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool(callParams({ min_severity: 'critical' }));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.findings.length).toBeGreaterThan(0);
    expect(output.findings.every((f) => f.severity === 'CRITICAL')).toBe(true);
  });

  it('concise caps at 15 with truncated; full caps at 10 with suggestions', async () => {
    const manyFindings = Array.from({ length: 20 }, (_, i) =>
      makeFinding({ title: `F${i}`, file: `f${i}.ts`, start_line: i + 1, end_line: i + 1 }),
    );
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, findings: manyFindings }] },
    };
    const { client } = await connectTestServer(routes);

    const concise = await client.callTool(callParams({}));
    const conciseOutput = ReviewResultSchema.parse(concise.structuredContent);
    expect(conciseOutput.findings).toHaveLength(15);
    expect(conciseOutput.truncated).toBe(true);
    expect(conciseOutput.findings[0]?.suggestion).toBeUndefined();

    const full = await client.callTool(callParams({ detail: 'full' }));
    const fullOutput = ReviewResultSchema.parse(full.structuredContent);
    expect(fullOutput.findings).toHaveLength(10);
    expect(fullOutput.findings[0]?.suggestion).toBe('fix it');
  });

  it('truncated at min_severity=CRITICAL points at the web UI, not a repeat call', async () => {
    const manyCritical = Array.from({ length: 20 }, (_, i) =>
      makeFinding({ severity: 'CRITICAL', title: `C${i}`, file: `c${i}.ts`, start_line: i + 1, end_line: i + 1 }),
    );
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, findings: manyCritical }] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({ min_severity: 'critical' }));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.truncated).toBe(true);
    expect(output.next_step).toBe(`Showing 15 of 20 CRITICAL; see all at ${output.web_url}.`);
    expect(output.next_step).not.toContain('min_severity=CRITICAL');
  });

  it('formats location and rounds confidence', async () => {
    const review: ApiReview = {
      ...SEEDED_REVIEW,
      findings: [
        makeFinding({ severity: 'CRITICAL', title: 'T', file: 'a.ts', start_line: 3, end_line: 3, confidence: 0.987654 }),
        makeFinding({ severity: 'WARNING', title: 'T2', file: 'b.ts', start_line: 3, end_line: 5, confidence: 0.5 }),
      ],
    };
    const routes: Routes = { ...defaultRoutes(), [`GET ${REVIEWS_PATH}`]: { status: 200, body: [review] } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    const output = ReviewResultSchema.parse(result.structuredContent);

    const first = output.findings.find((f) => f.title === 'T');
    expect(first?.location).toBe('a.ts:3');
    expect(first?.confidence).toBe(0.99);
    const second = output.findings.find((f) => f.title === 'T2');
    expect(second?.location).toBe('b.ts:3-5');
  });

  it('has no returned/total keys, and omits dismissed and next_step when not applicable', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool(callParams({}));
    const output = result.structuredContent as Record<string, unknown>;
    expect(output).not.toHaveProperty('returned');
    expect(output).not.toHaveProperty('total');
    expect('dismissed' in output).toBe(false);
    expect('next_step' in output).toBe(false);
  });

  it('accepts pr_number given as "#482" (D8 coercion, over the wire)', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr_number: '#482' },
    });
    expect(result.isError).not.toBe(true);
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.pr_number).toBe(482);
  });

  it('sanitizes finding fields in actual tool output, not just at the sanitize-unit level', async () => {
    const dirty = makeFinding({
      severity: 'CRITICAL',
      title: 'Bad​title ![img](http://evil.example/x.png)',
      category: 'sec​urity',
      rationale: 'Contains <img src=x onerror=alert(1)> and a\u0007bell',
    });
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${REVIEWS_PATH}`]: { status: 200, body: [{ ...SEEDED_REVIEW, findings: [dirty] }] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    const output = ReviewResultSchema.parse(result.structuredContent);
    const finding = output.findings[0]!;

    expect(finding.title).not.toContain('​');
    expect(finding.title).toContain('[image: img]');
    expect(finding.title).not.toContain('![img]');
    expect(finding.category).not.toContain('​');
    expect(finding.rationale).toContain('&lt;img');
    expect(finding.rationale).not.toContain('<img');
    expect(finding.rationale).not.toContain('\u0007');
  });
});

describe('T11 — get_findings run_id and error paths', () => {
  it('a running run_id is polled up to findingsWaitMs, then returns running', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${RUN_PATH}`]: { status: 200, body: [makeRun({ status: 'running' })] },
    };
    const { client } = await connectTestServer(routes, { findingsWaitMs: 20, pollIntervalMs: 5 });
    const result = await client.callTool(callParams({ run_id: SEEDED_RUN_ID }));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.status).toBe('running');
    expect(output.next_step).toContain('about a minute');
  });

  it('E16: an unknown run_id (syntactically a UUID, but not one of this PR\'s runs)', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool(
      callParams({ run_id: '00000000-0000-4000-8000-000000009999' }),
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Omit run_id');
  });

  it('E16 agent variant: the run_id belongs to a different agent', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const result = await client.callTool(callParams({ run_id: SEEDED_RUN_ID, agent: 'general' }));
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Drop agent or run_id');
  });

  it('E17 running variant: no done run, but one is running', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${RUN_PATH}`]: { status: 200, body: [makeRun({ run_id: 'run-running-only', status: 'running' })] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('still running');
  });

  it('run_id is bounded to a UUID shape (unbounded string was echoed raw by E16/E16 agent)', () => {
    expect(INPUT_SHAPE.run_id.safeParse(SEEDED_RUN_ID).success).toBe(true);
    expect(INPUT_SHAPE.run_id.safeParse(undefined).success).toBe(true);
    expect(INPUT_SHAPE.run_id.safeParse('nope').success).toBe(false);
    expect(INPUT_SHAPE.run_id.safeParse('a'.repeat(5000)).success).toBe(false);
  });

  it('E17 none variant: no runs at all', async () => {
    const routes: Routes = { ...defaultRoutes(), [`GET ${RUN_PATH}`]: { status: 200, body: [] } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('run_agent_on_pr');
  });

  it('E17 sanitizes a bidi/newline agent name before it reaches the result text (D13)', async () => {
    const dirtyName = 'Security‮Reviewer\nEvil';
    const routes: Routes = {
      ...defaultRoutes(),
      'GET /agents': {
        status: 200,
        body: [{ id: 'agent-security', name: dirtyName, description: 'd', provider: 'openrouter', model: 'm', enabled: true }],
      },
      [`GET ${RUN_PATH}`]: { status: 200, body: [] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({ agent: 'security' }));
    expect(result.isError).toBe(true);
    const out = text(result);
    expect(out).toContain('run_agent_on_pr');
    expect(out).not.toContain('‮');
    expect(out).not.toContain('\n');
  });

  it('E18: the run finished but its review was deleted', async () => {
    const routes: Routes = { ...defaultRoutes(), [`GET ${REVIEWS_PATH}`]: { status: 200, body: [] } };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('review was deleted');
  });

  it('a deleted agent shows agent: null', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET ${RUN_PATH}`]: { status: 200, body: [makeRun({ agent_id: null, agent_name: null })] },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    const output = ReviewResultSchema.parse(result.structuredContent);
    expect(output.agent).toBeNull();
  });

  it('a disabled agent is accepted by the read tool', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      'GET /agents': {
        status: 200,
        body: [{ id: 'agent-security', name: 'Security Reviewer', description: 'd', provider: 'openrouter', model: 'm', enabled: false }],
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({ agent: 'security' }));
    expect(result.isError).not.toBe(true);
  });

  it('E3: a PR not imported yet (a read tool never syncs)', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/999`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'nope' } },
      },
    };
    const { client, calls } = await connectTestServer(routes);
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr_number: 999 },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(messages.e3(999, 'acme/payments-api'));
    expect(calls.some((c) => c.path === `/repos/${SEEDED_REPO.id}/pulls`)).toBe(false);
  });

  it('E9: a null PR id from the API is a contract mismatch, surfaced as isError', async () => {
    const routes: Routes = {
      ...defaultRoutes(),
      [`GET /repos/${SEEDED_REPO.id}/pulls/${SEEDED_PR.number}`]: {
        status: 200,
        body: { ...SEEDED_PR, id: null },
      },
    };
    const { client } = await connectTestServer(routes);
    const result = await client.callTool(callParams({}));
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('DevDigest bug, not your input');
  });
});
