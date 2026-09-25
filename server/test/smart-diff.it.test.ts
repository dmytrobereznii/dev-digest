/**
 * T3 — `GET /pulls/:id/smart-diff` end to end (D3/D4/D5/D14, §5, §10). Real
 * Postgres via testcontainers, driven through `app.inject`. Seeded #482
 * (reviewed) and #479 (unreviewed) already exist and are used as-is; a
 * freshly-inserted PR covers the dismiss/accept mutation so it never touches
 * shared seed state other tests in this file depend on. The #499 fixture
 * (spec §6 step 4) is seeded alongside them and exercised the same way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A syntactically valid uuid that matches no seeded row. */
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

d('smart-diff module (Testcontainers pg)', () => {
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

  function appWith(mock: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}), llm: { openai: mock, openrouter: mock } },
    });
  }

  let repoSeq = 0;
  /** A PR with its own review and two findings on the same file, isolated
   *  from the seeded fixtures so the dismiss/accept test can mutate it freely. */
  async function setupReviewedPr(db: PgFixture['handle']['db']) {
    const name = `smart-diff-${repoSeq++}`;
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
        headSha: 'sha-smart-diff',
        additions: 20,
        deletions: 2,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/lib/widget.ts',
      additions: 20,
      deletions: 2,
      patch: '@@ -1,10 +1,20 @@\n context\n+line 8\n+line 20',
    });
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'Two issues in the widget.',
        score: 50,
        model: 'seed',
      })
      .returning();
    const [critical, warning] = await db
      .insert(t.findings)
      .values([
        {
          reviewId: review!.id,
          file: 'src/lib/widget.ts',
          startLine: 8,
          endLine: 8,
          severity: 'CRITICAL',
          category: 'bug',
          title: 'Unbounded retry loop',
          rationale: 'Retries forever on a permanent failure.',
          confidence: 0.9,
        },
        {
          reviewId: review!.id,
          file: 'src/lib/widget.ts',
          startLine: 20,
          endLine: 20,
          severity: 'WARNING',
          category: 'style',
          title: 'Magic number',
          rationale: 'The backoff constant should be named.',
          confidence: 0.7,
        },
      ])
      .returning();
    return { pr: pr!, findingIds: { critical: critical!.id, warning: warning!.id } };
  }

  it('#482 (seeded, reviewed): body parses, roles and finding_lines match A2/A4, and the mock is never called', async () => {
    const mock = new MockLLMProvider('openai');
    const app = await appWith(mock);

    const [pr482] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const [review482] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr482!.id));

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr482!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.review_id).toBe(review482!.id);

    const byRole = new Map(body.groups.map((g) => [g.role, g.files]));
    const configFile = byRole.get('wiring')!.find((f) => f.path === 'src/config.ts');
    expect(configFile).toMatchObject({ finding_lines: [12] }); // A4 — wiring, CRITICAL at line 12
    const usersFile = byRole.get('core')!.find((f) => f.path === 'src/api/users.ts');
    expect(usersFile).toMatchObject({ finding_lines: [45] }); // A4 — core, WARNING at line 45

    // A2 — no model call on a read of a structural view.
    expect(mock.calls).toHaveLength(0);

    await app.close();
  });

  it('#479 (seeded, unreviewed): review_id is null and every finding_lines is empty', async () => {
    const mock = new MockLLMProvider('openai');
    const app = await appWith(mock);

    const [pr479] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 479));

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr479!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());

    expect(body.review_id).toBeNull();
    const allFindingLines = body.groups.flatMap((g) => g.files.flatMap((f) => f.finding_lines));
    expect(allFindingLines).toEqual([]);

    await app.close();
  });

  it('dismissing a finding removes its line from the next response; accepting one keeps it (A5)', async () => {
    const mock = new MockLLMProvider('openai');
    const app = await appWith(mock);
    const { pr, findingIds } = await setupReviewedPr(pg.handle.db);

    const before = SmartDiffResponse.parse(
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json(),
    );
    const widgetBefore = before.groups.flatMap((g) => g.files).find((f) => f.path === 'src/lib/widget.ts');
    expect(widgetBefore?.finding_lines).toEqual([8, 20]);

    const dismissRes = await app.inject({ method: 'POST', url: `/findings/${findingIds.critical}/dismiss` });
    expect(dismissRes.statusCode).toBe(200);
    const acceptRes = await app.inject({ method: 'POST', url: `/findings/${findingIds.warning}/accept` });
    expect(acceptRes.statusCode).toBe(200);

    const after = SmartDiffResponse.parse(
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json(),
    );
    const widgetAfter = after.groups.flatMap((g) => g.files).find((f) => f.path === 'src/lib/widget.ts');
    expect(widgetAfter?.finding_lines).toEqual([20]); // dismissed line 8 is gone; accepted line 20 stays

    await app.close();
  });

  it('404 on an unknown pull id, 422 on a non-uuid', async () => {
    const mock = new MockLLMProvider('openai');
    const app = await appWith(mock);

    const unknown = await app.inject({ method: 'GET', url: `/pulls/${UNKNOWN_ID}/smart-diff` });
    expect(unknown.statusCode).toBe(404);

    const malformed = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(malformed.statusCode).toBe(422);

    await app.close();
  });

  it('#499 (spec §6 step 4): boilerplate/wiring split and its 3 findings land as finding_lines (A2/A4/A7/A9)', async () => {
    const mock = new MockLLMProvider('openai');
    const app = await appWith(mock);

    const [pr499] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 499));
    expect(pr499).toBeDefined();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr499!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());

    const byRole = new Map(body.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.get('boilerplate')).toContain('pnpm-lock.yaml');
    expect(byRole.get('wiring')).toContain('package.json');

    // One CRITICAL in retry-window.ts and one WARNING in retry.ts, both core.
    const core = body.groups.find((g) => g.role === 'core')!;
    const coreWithFindings = core.files.filter((f) => f.finding_lines.length > 0);
    expect(coreWithFindings).toHaveLength(2);

    // One SUGGESTION in the test file.
    const tests = body.groups.find((g) => g.role === 'tests')!;
    expect(tests.files.some((f) => f.finding_lines.length > 0)).toBe(true);

    expect(body.review_id).not.toBeNull();

    await app.close();
  });
});
