import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { PrBriefRecord, PrBriefResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockDocumentReader,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * The PR brief module end to end: real Postgres, mock LLM, `MockSecretsProvider`
 * (so a key on the host never reaches a test), and a GitHub client that throws
 * on every call. `src/a.ts` has new-side lines 1-5 changed, `src/b.ts` 10-12.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const baseConfig = (): AppConfig => ({
  ...loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
  repoIntelEnabled: true,
});

const FIXTURE = {
  summary: 'Adds a limiter to the public API.',
  risks: [
    {
      kind: 'perf',
      title: 'Buckets grow',
      explanation: 'No eviction.',
      severity: 'medium',
      file_refs: ['src/a.ts:2'],
    },
  ],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'Check the branch.' }],
};

/** Records every call of a `MockLLMProvider` and holds `completeStructured` until released. */
class GatedMock extends MockLLMProvider {
  started = 0;
  private open!: () => void;
  private gate = new Promise<void>((r) => (this.open = r));
  release() {
    this.open();
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.started++;
    await this.gate;
    return super.completeStructured(req as never) as Promise<never>;
  }
}

/** A GitHubClient whose every method throws; `calls` names what was reached. */
function throwingGitHub() {
  const calls: string[] = [];
  const client: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(MockGitHubClient.prototype)) {
    if (name === 'constructor') continue;
    client[name] = async () => {
      calls.push(name);
      throw new Error(`GitHub must not be reached: ${name}`);
    };
  }
  return { client: client as unknown as MockGitHubClient, calls };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('condition not met in time');
    await sleep(10);
  }
}

const structuredCalls = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');
const userMessage = (m: MockLLMProvider) =>
  (structuredCalls(m)[0]!.req as { messages: { role: string; content: string }[] }).messages[1]!.content;

d('brief module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const reader = new MockDocumentReader();
  const tokenizer = new TiktokenTokenizer();
  const github = throwingGitHub();
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    reader.files = {};
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(
    mock: MockLLMProvider,
    opts: { config?: Partial<AppConfig>; repoIntel?: RepoIntel; secrets?: Record<string, string>; noLlm?: boolean } = {},
  ) {
    const app = await buildApp({
      config: { ...baseConfig(), ...opts.config },
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(opts.secrets ?? {}),
        ...(opts.noLlm ? {} : { llm: { openrouter: mock, openai: mock } }),
        github: github.client,
        documents: reader,
        ...(opts.repoIntel ? { repoIntel: opts.repoIntel } : {}),
      },
    });
    apps.push(app);
    return app;
  }
  const okMock = (fixture: unknown = FIXTURE) =>
    new MockLLMProvider('openai', { structuredBySchema: { pr_brief: fixture } });

  async function setupPr(opts: { files?: boolean; ws?: string; clonePath?: string | null } = {}) {
    const n = ++seq;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: opts.ws ?? workspaceId,
        owner: 'acme',
        name: `brief-${n}`,
        fullName: `acme/brief-${n}`,
        clonePath: opts.clonePath === undefined ? '/clones/fake' : opts.clonePath,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: opts.ws ?? workspaceId,
        repoId: repo!.id,
        number: 700 + n,
        title: 'Add a limiter',
        author: 'jrn.pearse',
        branch: 'feat/limiter',
        base: 'main',
        headSha: 'sha-v1',
        additions: 8,
        deletions: 1,
        filesCount: 2,
        status: 'needs_review',
        body: 'Adds a limiter.',
      })
      .returning();
    if (opts.files !== false) {
      await pg.handle.db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'src/a.ts', additions: 5, deletions: 1, patch: '@@ -1,2 +1,5 @@\n ctx\n+one\n+two' },
        { prId: pr!.id, path: 'src/b.ts', additions: 3, deletions: 0, patch: '@@ -10,2 +10,3 @@\n ctx\n+three' },
      ]);
    }
    return { repo: repo!, pr: pr! };
  }

  const post = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/brief`, payload: {} });
  const get = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const rows = (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  async function attachDocs(repoId: string, paths: string[]) {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `brief-agent-${++seq}`, provider: 'openai', model: 'gpt-4o', systemPrompt: 'x' })
      .returning();
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values(paths.map((path) => ({ repoId, agentId: agent!.id, path })));
  }

  it('GET returns brief null and generating false before any generation', async () => {
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, generating: false });
  });

  it('POST stores the brief with head_sha, model, tokens and cost inside pr_brief.json', async () => {
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);

    const [row] = await rows(pr.id);
    expect(row!.json).toMatchObject({
      pr_id: pr.id,
      summary: FIXTURE.summary,
      head_sha: 'sha-v1',
      model: 'anthropic/claude-haiku-4.5',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
    });
    expect(res.json()).toMatchObject({ head_sha: 'sha-v1', model: 'anthropic/claude-haiku-4.5', stale: false });
    expect(row!.json).not.toHaveProperty('stale');
  });

  it('a second POST replaces the stored brief and leaves one row', async () => {
    const { pr } = await setupPr();
    const first = await appWith(okMock({ ...FIXTURE, summary: 'First.' }));
    await post(first, pr.id);
    const second = await appWith(okMock({ ...FIXTURE, summary: 'Second.' }));
    expect((await post(second, pr.id)).statusCode).toBe(200);

    const stored = await rows(pr.id);
    expect(stored).toHaveLength(1);
    expect((stored[0]!.json as { summary: string }).summary).toBe('Second.');
  });

  it('GET returns the stored record and makes zero model calls', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const { pr } = await setupPr();
    const generated = (await post(app, pr.id)).json();
    expect(mock.calls).toHaveLength(1);

    const res = await get(app, pr.id);
    expect(res.json()).toEqual({ brief: generated, generating: false });
    expect(mock.calls).toHaveLength(1);
  });

  it('GET marks the brief stale after the PR head moves', async () => {
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    await post(app, pr.id);
    expect((await get(app, pr.id)).json().brief.stale).toBe(false);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-v2' }).where(eq(t.pullRequests.id, pr.id));
    const brief = (await get(app, pr.id)).json().brief;
    expect(brief.stale).toBe(true);
    expect(brief.head_sha).toBe('sha-v1');
  });

  it('GET and POST are 404 for a PR outside the workspace', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const { pr: foreign } = await setupPr({ ws: otherWs!.id });

    for (const id of [UNKNOWN_ID, foreign.id]) {
      expect((await get(app, id)).statusCode).toBe(404);
      expect((await post(app, id)).statusCode).toBe(404);
    }
    expect(mock.calls).toHaveLength(0);
  });

  it('stored JSON that fails the contract reads as brief null', async () => {
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { summary: 'no other fields' } });
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief).toBeNull();
  });

  it('one generation records exactly one completeStructured call and no other model call', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const { pr } = await setupPr();
    await post(app, pr.id);
    expect(mock.calls.map((c) => c.method)).toEqual(['completeStructured']);
    expect((mock.calls[0]!.req as { schemaName: string }).schemaName).toBe('pr_brief');
  });

  it("generation uses the risk_brief default, then the workspace's choice", async () => {
    const openrouter = okMock();
    const openai = okMock();
    const app = await buildApp({
      config: baseConfig(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        llm: { openrouter, openai },
        github: github.client,
        documents: reader,
      },
    });
    apps.push(app);
    const { pr } = await setupPr();

    await post(app, pr.id);
    expect(structuredCalls(openrouter)).toHaveLength(1);
    expect((structuredCalls(openrouter)[0]!.req as { model: string }).model).toBe('anthropic/claude-haiku-4.5');
    expect(openai.calls).toHaveLength(0);

    try {
      const put = await app.inject({
        method: 'PUT',
        url: '/settings',
        payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-4.1' } } },
      });
      expect(put.statusCode).toBe(200);
      const res = await post(app, pr.id);
      expect(res.json().model).toBe('gpt-4.1');
      expect(structuredCalls(openai)).toHaveLength(1);
      expect((structuredCalls(openai)[0]!.req as { model: string }).model).toBe('gpt-4.1');
      expect(structuredCalls(openrouter)).toHaveLength(1);
    } finally {
      await pg.handle.db.delete(t.settings).where(eq(t.settings.key, 'feature_models'));
    }
  });

  it('with intent, blast and documents the request carries all three, missing_inputs is empty and specs_used lists the documents', async () => {
    const mock = okMock();
    const repoIntel = {
      getBlastRadius: async () => ({
        changedSymbols: [{ file: 'src/a.ts', name: 'doThing', kind: 'function' }],
        callers: [{ file: 'src/api/handler.ts', symbol: 'handle', viaSymbol: 'doThing', line: 12, rank: 3 }],
        impactedEndpoints: [],
        factsByFile: {},
        degraded: false,
      }),
      getIndexState: async () => ({
        repoId: 'x',
        status: 'full' as const,
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
        lastIndexedSha: 'abc',
        indexerVersion: 2,
        updatedAt: new Date(),
      }),
    } as unknown as RepoIntel;
    const app = await appWith(mock, { repoIntel });
    const { pr, repo } = await setupPr();
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'INTENT-SENTENCE-XYZ',
      inScope: ['IN-SCOPE-ITEM'],
      outOfScope: ['OUT-SCOPE-ITEM'],
      headSha: 'sha-v1',
    });
    reader.files = { 'docs/spec.md': 'SPEC-BODY-ONE', 'docs/zeta.md': 'SPEC-BODY-TWO' };
    await attachDocs(repo.id, ['docs/zeta.md', 'docs/spec.md']);

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const brief = res.json();
    expect(brief.missing_inputs).toEqual([]);
    expect(brief.specs_used).toEqual(['docs/spec.md', 'docs/zeta.md']);
    expect(brief.intent).toMatchObject({ intent: 'INTENT-SENTENCE-XYZ', in_scope: ['IN-SCOPE-ITEM'] });
    expect(brief.blast.changed_symbols[0].name).toBe('doThing');

    const text = userMessage(mock);
    expect(text).toContain('INTENT-SENTENCE-XYZ');
    expect(text).toContain('IN-SCOPE-ITEM');
    expect(text).toContain('OUT-SCOPE-ITEM');
    expect(text).toContain('doThing (function) in src/a.ts');
    expect(text).toContain('src/api/handler.ts');
    expect(text).toContain('SPEC-BODY-ONE');
    expect(text).toContain('SPEC-BODY-TWO');
    // Ranges only, never a patch line.
    expect(text).toContain('src/a.ts [core] +5 -1 changed lines: 1-5');
    expect(text).not.toContain('+one');
  });

  it('documents are included in path order, whole, until the budget is reached', async () => {
    const mock = okMock();
    const small = 'alpha '.repeat(20);
    const big = 'beta '.repeat(400);
    const budget = tokenizer.count(small) + 10; // fits `a`, not `b` after it
    reader.files = { 'docs/a.md': small, 'docs/b.md': big, 'docs/c.md': 'tiny' };
    const app = await appWith(mock, { config: { projectContextBudget: budget } });
    const { pr, repo } = await setupPr();
    await attachDocs(repo.id, ['docs/c.md', 'docs/b.md', 'docs/a.md']);

    const res = await post(app, pr.id);
    expect(res.json().specs_used).toEqual(['docs/a.md']);
    const text = userMessage(mock);
    expect(text).toContain(small);
    expect(text).not.toContain('beta beta');
    expect(text).not.toContain('tiny');
  });

  it('no stored intent: generated with intent null and intent listed as missing', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().intent).toBeNull();
    expect(res.json().missing_inputs).toContain('intent');
    expect(userMessage(mock)).not.toContain('## PR intent');
  });

  it('blast missing: generated with blast null and blast listed as missing', async () => {
    const mock = okMock();
    const degraded = {
      getBlastRadius: async () => ({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        factsByFile: {},
        degraded: true,
        reason: 'no_data',
      }),
      getIndexState: async () => null,
    } as unknown as RepoIntel;
    const app = await appWith(mock, { repoIntel: degraded });
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().blast).toBeNull();
    expect(res.json().missing_inputs).toContain('blast');
    expect(userMessage(mock)).not.toContain('## Blast radius');
  });

  it('no document included: generated with specs listed as missing', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().missing_inputs).toContain('specs');
    expect(res.json().specs_used).toEqual([]);
    expect(userMessage(mock)).not.toContain('## Project documents');
  });

  it('ungrounded entries are dropped and counted in the stored brief', async () => {
    const mock = okMock({
      summary: 'S',
      risks: [
        { kind: 'a', title: 'kept', explanation: 'e', severity: 'low', file_refs: ['src/a.ts:2', 'src/ghost.ts:1'] },
        { kind: 'a', title: 'path only', explanation: 'e', severity: 'low', file_refs: ['src/b.ts:99'] },
        { kind: 'a', title: 'dropped', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts'] },
      ],
      review_focus: [
        { file: 'src/b.ts', line: 11, reason: 'ok' },
        { file: 'src/b.ts', line: 99, reason: 'outside' },
        { file: 'src/ghost.ts', line: 1, reason: 'unknown file' },
      ],
    });
    const app = await appWith(mock);
    const { pr } = await setupPr();
    await post(app, pr.id);

    const [row] = await rows(pr.id);
    const stored = row!.json as {
      risks: { risks: { title: string; file_refs: string[] }[] };
      review_focus: { reason: string }[];
      dropped: unknown;
    };
    expect(stored.risks.risks.map((r) => [r.title, r.file_refs])).toEqual([
      ['kept', ['src/a.ts:2']],
      ['path only', ['src/b.ts']],
    ]);
    expect(stored.review_focus.map((i) => i.reason)).toEqual(['ok']);
    expect(stored.dropped).toEqual({ risks: 1, review_focus: 2 });
  });

  it('a failing model call is 502 brief_failed and leaves the stored brief unchanged', async () => {
    const { pr } = await setupPr();
    const good = await appWith(okMock());
    await post(good, pr.id);
    const before = (await get(good, pr.id)).json();

    const bad = await appWith(new MockLLMProvider('openai', { structuredBySchema: { pr_brief: { nope: true } } }));
    const res = await post(bad, pr.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_failed');
    expect((await get(bad, pr.id)).json()).toEqual(before);
  });

  it('a missing provider key is 502 brief_failed naming OPENROUTER_API_KEY', async () => {
    const app = await appWith(okMock(), { noLlm: true });
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_failed');
    expect(res.json().error.message).toContain('OPENROUTER_API_KEY');
    expect(await rows(pr.id)).toHaveLength(0);
  });

  it('output over a cap is 502 brief_failed and stores nothing', async () => {
    const risk = (i: number) => ({ ...FIXTURE.risks[0]!, title: `r${i}` });
    const app = await appWith(okMock({ ...FIXTURE, risks: [0, 1, 2, 3, 4, 5, 6].map(risk) }));
    const { pr } = await setupPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_failed');
    expect(await rows(pr.id)).toHaveLength(0);
    expect((await get(app, pr.id)).json().brief).toBeNull();
  });

  it('a PR with zero changed files is 422 brief_no_files with no model call', async () => {
    const mock = okMock();
    const app = await appWith(mock);
    const { pr } = await setupPr({ files: false });
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('brief_no_files');
    expect(mock.calls).toHaveLength(0);
  });

  it('a request during a generation is 409 brief_in_progress, GET reports generating, one model call in total', async () => {
    const mock = new GatedMock('openai', { structuredBySchema: { pr_brief: FIXTURE } });
    const app = await appWith(mock);
    const { pr } = await setupPr();

    const first = (async () => post(app, pr.id))();
    await until(() => mock.started === 1);

    const reading = await get(app, pr.id);
    expect(reading.json()).toEqual({ brief: null, generating: true });
    const second = await post(app, pr.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('brief_in_progress');

    mock.release();
    expect((await first).statusCode).toBe(200);
    expect(mock.started).toBe(1);
    expect(structuredCalls(mock)).toHaveLength(1);
    expect((await get(app, pr.id)).json().generating).toBe(false);
  });

  it('reading and generating make no GitHub request', async () => {
    github.calls.length = 0;
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    expect((await get(app, pr.id)).statusCode).toBe(200);
    expect((await post(app, pr.id)).statusCode).toBe(200);
    expect((await get(app, pr.id)).statusCode).toBe(200);
    expect(github.calls).toEqual([]);
    expect(Object.keys(github.client as object).length).toBeGreaterThan(5);
  });

  it('responses parse against the shared contracts and an invalid id is 422', async () => {
    const app = await appWith(okMock());
    const { pr } = await setupPr();
    expect(PrBriefResponse.parse((await get(app, pr.id)).json()).brief).toBeNull();
    const generated = await post(app, pr.id);
    expect(PrBriefRecord.safeParse(generated.json()).success).toBe(true);
    expect(PrBriefResponse.parse((await get(app, pr.id)).json()).brief).not.toBeNull();

    expect((await get(app, 'not-a-uuid')).statusCode).toBe(422);
    expect((await post(app, 'not-a-uuid')).statusCode).toBe(422);
    expect((await get(app, UNKNOWN_ID)).json().error.code).toEqual(expect.any(String));
  });

  it('the 11th generation request in a minute is 429', async () => {
    const mock = okMock();
    const app = await appWith(mock, { config: { nodeEnv: 'production', logLevel: 'silent' } });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(app, UNKNOWN_ID)).statusCode);
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(404));
    expect(codes[10]).toBe(429);
    expect(mock.calls).toHaveLength(0);
  });
});
