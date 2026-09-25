/**
 * T4 — `GET /pulls/:id/blast` end to end (D1/D4/D6/D7, §5, §11 A1). Real
 * Postgres via testcontainers, driven through `app.inject`, precedent
 * `conventions/routes.test.ts` for the `RepoIntel` stub shape. Every case
 * forces `repoIntelEnabled: true` on the config — the seeded #482 case would
 * otherwise read `flag_off` instead of `no_data` if the host's `.env` had
 * `REPO_INTEL_ENABLED=false`.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => ({
  ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
  repoIntelEnabled: true,
});

/** A syntactically valid uuid that matches no seeded row. */
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

d('blast module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(repoIntel?: RepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: repoIntel ? { repoIntel } : {},
    });
  }

  let repoSeq = 0;
  /** A fresh PR isolated from the seeded fixtures, with `pr_files` optional
   *  (the `no_changed_files` case needs a PR row with zero files) — mirrors
   *  `smart-diff.it.test.ts`'s `setupReviewedPr` setup pattern. */
  async function insertPr(db: PgFixture['handle']['db'], opts: { withFiles: boolean }) {
    const name = `blast-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + repoSeq,
        title: 'Add a retry helper',
        author: 'jrn.pearse',
        branch: 'feat/retry-helper',
        base: 'main',
        headSha: 'sha-blast',
        additions: 20,
        deletions: 2,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    if (opts.withFiles) {
      await db.insert(t.prFiles).values({
        prId: pr!.id,
        path: 'src/lib/widget.ts',
        additions: 20,
        deletions: 2,
        patch: '@@ -1,10 +1,20 @@\n context\n+line 8\n+line 20',
      });
    }
    return { pr: pr!, repoId: repo!.id };
  }

  it('#482 (seeded, real facade, no clone): 200 degraded/no_data, body validates against BlastRadiusResponse', async () => {
    const app = await appWith();

    const [pr482] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr482!.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.status).toBe('degraded');
    expect(body.degraded_reason).toBe('no_data');

    await app.close();
  });

  it('404 on an unknown pull id, 422 on a non-uuid', async () => {
    const app = await appWith();

    const unknown = await app.inject({ method: 'GET', url: `/pulls/${UNKNOWN_ID}/blast` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: expect.any(String) } });

    const malformed = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(malformed.statusCode).toBe(422);

    await app.close();
  });

  it('a stub with a full index: ok, grouped downstream, index_sha set', async () => {
    const stub = {
      getBlastRadius: vi.fn(async () => ({
        changedSymbols: [{ file: 'src/lib/widget.ts', name: 'doThing', kind: 'function' }],
        callers: [
          { file: 'src/api/handler.ts', symbol: 'handle', viaSymbol: 'doThing', line: 12, rank: 3 },
        ],
        impactedEndpoints: ['GET /a'],
        factsByFile: {
          'src/api/handler.ts': { endpoints: ['GET /a'], crons: ['0 * * * *'] },
        },
        degraded: false,
      })),
      getIndexState: vi.fn(async () => ({
        repoId: 'ignored',
        status: 'full' as const,
        filesIndexed: 10,
        filesSkipped: 0,
        durationMs: 100,
        lastIndexedSha: 'abc123deadbeef',
        indexerVersion: 2,
        updatedAt: new Date(),
      })),
    } as unknown as RepoIntel;

    const app = await appWith(stub);
    const { pr } = await insertPr(pg.handle.db, { withFiles: true });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());

    expect(body.status).toBe('ok');
    expect(body.degraded_reason).toBeNull();
    expect(body.index_sha).toBe('abc123deadbeef');
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0]).toMatchObject({
      symbol: 'doThing',
      callers: [{ name: 'handle', file: 'src/api/handler.ts', line: 12 }],
      endpoints_affected: ['GET /a'],
      crons_affected: ['0 * * * *'],
    });
    expect(body.stats).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 1 });

    await app.close();
  });

  it('a freshly inserted PR with no pr_files: no_changed_files, and the stub is never called', async () => {
    const stub = {
      getBlastRadius: vi.fn(async () => {
        throw new Error('must not be called');
      }),
      getIndexState: vi.fn(async () => {
        throw new Error('must not be called');
      }),
    } as unknown as RepoIntel;

    const app = await appWith(stub);
    const { pr } = await insertPr(pg.handle.db, { withFiles: false });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());

    expect(body.status).toBe('degraded');
    expect(body.degraded_reason).toBe('no_changed_files');
    expect(body.index_sha).toBeNull();
    expect(body.downstream).toEqual([]);

    expect((stub.getBlastRadius as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((stub.getIndexState as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    await app.close();
  });
});
