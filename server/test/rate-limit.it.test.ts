import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

/**
 * The global rate limit at the app's seam. The plugin is not registered under
 * `nodeEnv: 'test'`, so these build the app as 'production'. Always with the
 * fixture's `db`: buildApp runs the boot reaper against whatever it is given.
 */
const d = (await dockerAvailable()) ? describe : describe.skip;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

d('global rate limit (Testcontainers pg)', () => {
  let pg: PgFixture;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(config: Partial<AppConfig>) {
    const mock = new MockLLMProvider('openai', {});
    const app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
        nodeEnv: 'production',
        logLevel: 'silent',
        ...config,
      },
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}), llm: { openrouter: mock, openai: mock } },
    });
    apps.push(app);
    return app;
  }
  const get = (app: Awaited<ReturnType<typeof appWith>>) =>
    app.inject({ method: 'GET', url: `/pulls/${UNKNOWN_ID}/brief` }).then((r) => r.statusCode);
  const post = (app: Awaited<ReturnType<typeof appWith>>) =>
    app.inject({ method: 'POST', url: `/pulls/${UNKNOWN_ID}/brief` }).then((r) => r.statusCode);

  it('the global limit follows rateLimitMax: with a max of 3 the fourth request in a minute is 429', async () => {
    const app = await appWith({ rateLimitMax: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push(await get(app));
    expect(codes.slice(0, 3)).toEqual([404, 404, 404]);
    expect(codes[3]).toBe(429);
  });

  it('a raised global limit leaves the brief generation route at 10 per minute', async () => {
    const app = await appWith({ rateLimitMax: 10000 });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push(await post(app));
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(404));
    expect(codes[10]).toBe(429);
  });
});
