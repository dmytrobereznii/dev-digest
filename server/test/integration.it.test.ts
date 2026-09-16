import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integration] Docker not available — skipping Testcontainers integration tests.',
  );
}

d('Testcontainers: pg + pgvector', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('migrations applied: every table exists', async () => {
    const rows = await pg.handle.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'public'`;
    // 35 domain tables + drizzle migration bookkeeping
    expect(rows[0]!.count).toBeGreaterThanOrEqual(35);
  });

  it('pgvector extension is enabled', async () => {
    const rows = await pg.handle.sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(rows).toHaveLength(1);
  });

  it('vector insert + similarity query round-trips', async () => {
    const { db } = pg.handle;
    const { workspaceId } = await seed(db);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'v', name: 'vec', fullName: 'v/vec' })
      .returning();
    const vec = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    await db.insert(t.codeChunks).values({
      workspaceId,
      repoId: repo!.id,
      path: 'a.ts',
      content: 'hello',
      embedding: vec,
      source: 'code',
    });
    // cosine distance query against the same vector → distance ~0
    const literal = `[${vec.join(',')}]`;
    const rows = await pg.handle.sql<{ dist: number }[]>`
      SELECT embedding <=> ${literal}::vector AS dist
      FROM code_chunks WHERE repo_id = ${repo!.id}`;
    expect(rows[0]!.dist).toBeLessThan(0.0001);
  });

  it('seed is idempotent (re-run does not duplicate workspace)', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);
    const ws = await pg.handle.db.select().from(t.workspaces);
    expect(ws.filter((w) => w.name === 'default')).toHaveLength(1);
  });
});

d('Testcontainers: DB-backed routes via app.inject', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('POST /repos persists + enqueues a clone (mock git) and GET /repos lists it', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const git = new MockGitClient();
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient() },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/widgets' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().full_name).toBe('acme/widgets');

    await app.container.jobs.onIdle();
    expect(git.cloned.some((c) => c.repo.name === 'widgets')).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/repos' });
    expect(list.json().some((r: { full_name: string }) => r.full_name === 'acme/widgets')).toBe(
      true,
    );
    await app.close();
  });

  it('GET /repos/:id/pulls imports PRs (mock GitHub) idempotently', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repos = await app.inject({ method: 'GET', url: '/repos' });
    const repoId = repos.json()[0]!.id;

    const first = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(first.statusCode).toBe(200);
    expect(first.json().length).toBeGreaterThan(0);
    // import again → still idempotent (unique repo_id+number)
    const second = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(second.json().length).toBe(first.json().length);
    await app.close();
  });

  it('GET /repos/:id/pulls totals cost across COMPLETED runs only', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    // The seeded PR already carries a run, so assert on the DELTA rather than
    // assuming a clean slate; `other` is a PR with no runs at all.
    const target = pulls[0]!;
    const baseline: number = target.cost_usd ?? 0;
    const other = pulls.find((p: { id: string; cost_usd: number | null }) => p.cost_usd == null);

    const [{ id: workspaceId }] = await pg.handle.db.select().from(t.workspaces);
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: target.id, status: 'done', costUsd: 0.01 },
      { workspaceId, prId: target.id, status: 'done', costUsd: 0.02 },
      // unpriced model: SUM skips it rather than treating it as free
      { workspaceId, prId: target.id, status: 'done', costUsd: null },
      // a failed run cost us nothing the user should be billed for in the list
      { workspaceId, prId: target.id, status: 'failed', costUsd: 0.99 },
    ]);

    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    const row = after.find((p: { id: string }) => p.id === target.id);
    expect(row.cost_usd).toBeCloseTo(baseline + 0.03, 10);
    if (other) {
      const untouched = after.find((p: { id: string }) => p.id === other.id);
      expect(untouched.cost_usd).toBeNull();
    }
    await app.close();
  });

  it('GET /repos/:id/pulls counts findings per severity from the LATEST review only', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    type Row = { id: string; number: number; score: number | null; findings: unknown };
    const pulls: Row[] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();

    // Seeded demo review on #482: one CRITICAL + one WARNING.
    const target = pulls.find((p) => p.number === 482)!;
    expect(target.findings).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    // A PR that was never reviewed has no counts, like its score.
    for (const p of pulls.filter((p) => p.score == null)) expect(p.findings).toBeNull();

    // A newer review REPLACES the counts (no summing across runs), and a
    // dismissed finding drops out.
    const [{ id: workspaceId }] = await pg.handle.db.select().from(t.workspaces);
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: target.id, kind: 'review', score: 70, createdAt: new Date(Date.now() + 60_000) })
      .returning();
    const finding = {
      reviewId: review!.id,
      file: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      category: 'style',
      title: 't',
      rationale: 'r',
      confidence: 0.9,
    };
    await pg.handle.db.insert(t.findings).values([
      { ...finding, severity: 'SUGGESTION' },
      { ...finding, severity: 'SUGGESTION' },
      { ...finding, severity: 'CRITICAL', dismissedAt: new Date() },
    ]);

    const after: Row[] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    const row = after.find((p) => p.id === target.id)!;
    expect(row.score).toBe(70);
    expect(row.findings).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 2 });
    await app.close();
  });

  it('POST /repos/:id/poll syncs PR list and does NOT trigger a review', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const poll = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(poll.json().reviewTriggered).toBe(false);
    expect(poll.json().synced).toBeGreaterThan(0);
    await app.close();
  });
});
