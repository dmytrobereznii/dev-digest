/**
 * GET /repos/:id/pulls/:number — the owner/name#N → PR uuid lookup (D4).
 * Reads Postgres only, so it is driven with no GitHub token configured
 * (`MockSecretsProvider({})`) to prove the route never reaches for GitHub.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

d('GET /repos/:id/pulls/:number (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('resolves the seeded PR with no GitHub token configured', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/482` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.number).toBe(482);
    expect(body.id).toMatch(UUID_RE);
    await app.close();
  });

  it('404s on a PR number that was never imported', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/999999` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
    await app.close();
  });

  it('422s on a non-uuid repo id', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}) },
    });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/pulls/482' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('422s on a PR number over the int4 max, rather than 500ing at the DB', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/3000000000` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
