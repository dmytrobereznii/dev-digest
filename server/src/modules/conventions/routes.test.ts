import { describe, it, expect } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { AuthProvider } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider } from '../../adapters/mocks.js';
import type { RepoIntel } from '../repo-intel/types.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from './repository.js';

/**
 * `/conventions` route smoke — no Docker, no Postgres. The DB is a stub that
 * answers the query chains this repository builds and keeps the rows it is given
 * in memory, so the whole pipeline runs for real: selection, the (mocked) model
 * call, the evidence gate, the persist and the `response:` schemas. The
 * DB-backed behaviour — scoping, the pending/settled split, the re-scan
 * dedupe — is `test/conventions.it.test.ts`'s job.
 */

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const REPO_ID = '22222222-2222-2222-2222-222222222222';
const CANDIDATE_ID = '33333333-3333-3333-3333-333333333333';

const auth: AuthProvider = {
  currentUser: async () => ({ id: 'user-1', email: 'dev@local', name: 'Dev' }),
  currentWorkspace: async () => ({ id: WORKSPACE_ID, name: 'default' }),
};

const PAYMENTS_TS = [
  "import { logger } from '../lib/logger';",
  '',
  'export async function capture(id: string) {',
  '  const charge = await gateway.capture(id);',
  '  return charge;',
  '}',
].join('\n');

const PACKAGE_JSON = '{\n  "name": "payments-api",\n  "type": "module"\n}';

const repoRow = (clonePath: string | null) => ({
  id: REPO_ID,
  workspaceId: WORKSPACE_ID,
  owner: 'acme',
  name: 'payments-api',
  clonePath,
});

const candidateRow = (over: Partial<ConventionRow> = {}): ConventionRow => ({
  id: CANDIDATE_ID,
  workspaceId: WORKSPACE_ID,
  repoId: REPO_ID,
  rule: 'Always use `async/await` instead of raw Promise chains',
  evidencePath: 'src/services/payments.ts:4',
  evidenceSnippet: '  const charge = await gateway.capture(id);',
  confidence: 0.91,
  accepted: false,
  status: 'pending',
  scanId: null,
  createdAt: new Date('2026-09-20T00:00:00.000Z'),
  ...over,
});

const scanRow = (): ConventionScanRow => ({
  id: '44444444-4444-4444-4444-444444444444',
  workspaceId: WORKSPACE_ID,
  repoId: REPO_ID,
  sampleCount: 84,
  model: 'anthropic/claude-haiku-4.5',
  createdAt: new Date('2026-09-20T00:00:00.000Z'),
});

/**
 * A stub `Db` that keeps `conventions` / `convention_scans` in memory and
 * dispatches on the table passed to `.from(…)` / `.insert(…)`. It does not
 * evaluate a `where`, so each method applies the semantics its one caller has:
 * the delete removes the pending rows, the update patches the rows it was given.
 */
function stubDb(opts: { repo?: ReturnType<typeof repoRow>; conventions?: ConventionRow[]; scans?: ConventionScanRow[] } = {}) {
  const repos = opts.repo === null ? [] : [opts.repo ?? repoRow('/clones/acme/payments-api')];
  const conventions = [...(opts.conventions ?? [])];
  const scans = [...(opts.scans ?? [])];
  const skills: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const rowsFor = (table: unknown): unknown[] => {
    if (table === t.repos) return repos;
    if (table === t.conventions) return conventions;
    if (table === t.conventionScans) return scans;
    return [];
  };

  // Every read chain this module builds ends in an await; `orderBy` / `limit`
  // are pass-throughs because the stub has no SQL to order by.
  const result = (rows: unknown[]): unknown => {
    const self = {
      where: () => result(rows),
      orderBy: () => result(rows),
      limit: () => result(rows),
      returning: async () => rows,
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
    };
    return self;
  };

  const db = {
    select: () => ({ from: (table: unknown) => result(rowsFor(table)) }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(values) ? values : [values];
        const stamped = list.map((v, i) => ({
          id: `row-${String(i)}`,
          createdAt: new Date('2026-09-20T12:00:00.000Z'),
          // Column defaults Postgres would apply and a stub will not: a fresh
          // candidate is `pending` / not accepted (D2).
          ...(table === t.conventions ? { status: 'pending', accepted: false } : {}),
          ...v,
        }));
        if (table === t.conventions) conventions.push(...(stamped as unknown as ConventionRow[]));
        if (table === t.conventionScans) scans.push(...(stamped as unknown as ConventionScanRow[]));
        if (table === t.skills) skills.push(...stamped);
        return {
          returning: async () => stamped,
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
    // `app.ts` reaps stale `agent_runs` on boot, so the table matters here: only
    // a write to `conventions` is recorded and applied.
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table !== t.conventions) return { where: () => ({ returning: async () => [] }) };
        updates.push(values);
        for (const row of conventions) Object.assign(row, values);
        return { where: () => ({ returning: async () => conventions }) };
      },
    }),
    delete: (table: unknown) => ({
      where: () => ({
        returning: async () => {
          if (table !== t.conventions) return [];
          const dropped = conventions.filter((c) => c.status === 'pending');
          for (const row of dropped) conventions.splice(conventions.indexOf(row), 1);
          return dropped;
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  } as unknown as Db;

  return { db, conventions, scans, skills, updates };
}

/** repo-intel is stubbed to the ONE method this module calls. */
const repoIntel = {
  getConventionSamples: async () => ['src/services/payments.ts'],
} as unknown as RepoIntel;

const git = () =>
  new MockGitClient({ files: { 'package.json': PACKAGE_JSON, 'src/services/payments.ts': PAYMENTS_TS } });

/** Two groundable rules and one fabricated quote, to exercise the gate. */
const EXTRACTION_FIXTURE = {
  conventions: [
    {
      rule: 'Always use `async/await` instead of raw Promise chains',
      evidence_path: 'src/services/payments.ts:118-140',
      evidence_snippet: '  const charge = await gateway.capture(id);',
      confidence: 0.91,
    },
    {
      rule: 'Declare the package as an ES module',
      evidence_path: 'package.json',
      evidence_snippet: '  "type": "module"',
      confidence: 1.4,
    },
    {
      rule: 'Never log a card number',
      evidence_path: 'src/services/payments.ts',
      evidence_snippet: '  logger.info({ card: redact(card) });',
      confidence: 0.8,
    },
  ],
};

function llm(fixture: unknown = EXTRACTION_FIXTURE) {
  return new MockLLMProvider('openai', {
    structuredBySchema: { ConventionExtraction: fixture },
  });
}

describe('/conventions routes (stub DB)', () => {
  it('GET /repos/:id/conventions returns the scan and its candidates', async () => {
    const { db } = stubDb({ conventions: [candidateRow()], scans: [scanRow()] });
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      scan: {
        id: '44444444-4444-4444-4444-444444444444',
        sample_count: 84,
        model: 'anthropic/claude-haiku-4.5',
        created_at: '2026-09-20T00:00:00.000Z',
      },
      candidates: [
        {
          id: CANDIDATE_ID,
          rule: 'Always use `async/await` instead of raw Promise chains',
          evidence_path: 'src/services/payments.ts:4',
          evidence_snippet: '  const charge = await gateway.capture(id);',
          confidence: 0.91,
          accepted: false,
          status: 'pending',
        },
      ],
    });
    await app.close();
  });

  it('GET returns scan: null before the first scan — the empty state signal (D4)', async () => {
    const { db } = stubDb();
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/conventions` });
    expect(res.json()).toEqual({ scan: null, candidates: [] });
    await app.close();
  });

  it('POST …/extract grounds the model response and persists only the survivors', async () => {
    const { db, scans } = stubDb();
    const model = llm();
    const app = await buildApp({
      config,
      db,
      overrides: { auth, git: git(), repoIntel, llm: { openrouter: model } },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${REPO_ID}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // ONE structured call, with the ONE schema name this module sends (D5).
    const structured = model.calls.filter((c) => c.method === 'completeStructured');
    expect(structured).toHaveLength(1);
    expect((structured[0]!.req as { schemaName: string }).schemaName).toBe('ConventionExtraction');

    // Sampled: package.json + the one ranked source. The default feature model
    // is OpenRouter's Haiku slug (D11), and the scan row records it.
    expect(body.scan.sample_count).toBe(2);
    expect(body.scan.model).toBe('anthropic/claude-haiku-4.5');
    expect(scans).toHaveLength(1);

    // The fabricated `logger.info` quote is gone; the two real ones survive, the
    // bogus line range is repaired from the text, and 1.4 is clamped to 1.
    expect(body.candidates.map((c: { rule: string }) => c.rule)).toEqual([
      'Always use `async/await` instead of raw Promise chains',
      'Declare the package as an ES module',
    ]);
    expect(body.candidates[0].evidence_path).toBe('src/services/payments.ts:4');
    expect(body.candidates[0].status).toBe('pending');
    expect(body.candidates[0].accepted).toBe(false);
    expect(body.candidates[1].confidence).toBe(1);
    await app.close();
  });

  it('POST …/extract is a 422 on a repo with no clone (the seeded repo, §5)', async () => {
    const { db } = stubDb({ repo: repoRow(null) });
    const app = await buildApp({
      config,
      db,
      overrides: { auth, git: git(), repoIntel, llm: { openrouter: llm() } },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${REPO_ID}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(res.json().error.message).toContain('no local clone');
    await app.close();
  });

  it('PUT /conventions/:id writes `accepted` together with `status`, and nothing else', async () => {
    const { db, updates } = stubDb({ conventions: [candidateRow()] });
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({
      method: 'PUT',
      url: `/conventions/${CANDIDATE_ID}`,
      // `rule` is not patchable: the zod body strips it rather than storing it.
      payload: { status: 'accepted', rule: 'something the user typed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'accepted', accepted: true });
    expect(updates).toEqual([{ status: 'accepted', accepted: true }]);
    await app.close();
  });

  it('PUT …/conventions/status accepts the listed rows and refuses a bulk reject (D2)', async () => {
    const { db, updates } = stubDb({ conventions: [candidateRow()] });
    const app = await buildApp({ config, db, overrides: { auth } });

    const ok = await app.inject({
      method: 'PUT',
      url: `/repos/${REPO_ID}/conventions/status`,
      payload: { status: 'accepted' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toHaveLength(1);
    expect(updates).toEqual([{ status: 'accepted', accepted: true }]);

    const rejected = await app.inject({
      method: 'PUT',
      url: `/repos/${REPO_ID}/conventions/status`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(422);
    await app.close();
  });

  it('POST …/conventions/skill writes source: extracted as v1, never a client-named source (D8)', async () => {
    const { db, skills } = stubDb({ conventions: [candidateRow({ status: 'accepted', accepted: true })] });
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${REPO_ID}/conventions/skill`,
      payload: {
        name: 'payments-api-conventions',
        description: '1 house convention extracted from payments-api',
        body: '# payments-api-conventions\n\nHouse conventions.',
        convention_ids: [CANDIDATE_ID],
        // A client claiming its own provenance must not be believed.
        source: 'manual',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      source: 'extracted',
      enabled: true,
      version: 1,
    });
    expect(skills[0]).toMatchObject({ source: 'extracted', type: 'convention', version: 1 });
    await app.close();
  });

  it('rejects a convention_id that is not a candidate of this repo', async () => {
    const { db } = stubDb({ conventions: [] });
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${REPO_ID}/conventions/skill`,
      payload: {
        name: 'x',
        body: '# x',
        convention_ids: ['55555555-5555-5555-5555-555555555555'],
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('validates at the edge: a non-uuid id, an unknown status, an empty merge', async () => {
    const { db } = stubDb();
    const app = await buildApp({ config, db, overrides: { auth } });

    expect(
      (await app.inject({ method: 'GET', url: '/repos/not-a-uuid/conventions' })).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/conventions/${CANDIDATE_ID}`,
          payload: { status: 'maybe' },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/repos/${REPO_ID}/conventions/skill`,
          payload: { name: 'x', body: '# x', convention_ids: [] },
        })
      ).statusCode,
    ).toBe(422);
    await app.close();
  });
});
