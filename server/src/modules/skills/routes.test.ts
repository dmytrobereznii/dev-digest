import { describe, it, expect } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { AuthProvider } from '@devdigest/shared';
import type { SkillRow } from './repository.js';

/**
 * `/skills` route smoke — no Docker, no Postgres. The DB is a stub that answers
 * the two query chains the skills repository builds (list / insert), so the
 * routes run end to end through the zod type provider: params, body defaults
 * and the `response:` schema all serialize for real. DB-backed behaviour
 * (versioning, cascade, scoping) is covered in `test/skills.it.test.ts`.
 */

// Every env var in the schema has a default, so the test config needs no
// `process.env` (which the lint rule reserves for config.ts / SecretsProvider).
const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const auth: AuthProvider = {
  currentUser: async () => ({ id: 'user-1', email: 'dev@local', name: 'Dev' }),
  currentWorkspace: async () => ({ id: WORKSPACE_ID, name: 'default' }),
};

const seededSkill: SkillRow = {
  id: '22222222-2222-2222-2222-222222222222',
  workspaceId: WORKSPACE_ID,
  name: 'pr-quality-rubric',
  description: 'Score each change on scope, tests and blast radius.',
  type: 'rubric',
  source: 'manual',
  body: '# PR Quality Rubric\n\nScore each change.',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date('2026-09-20T00:00:00.000Z'),
};

/** Records every `insert(...).values(...)` so a test can assert what was stored. */
function stubDb(rows: SkillRow[]) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: async () => rows }) }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return {
          returning: async () => [{ ...seededSkill, ...values }],
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
  } as unknown as Db;
  return { db, inserted };
}

describe('/skills routes (stub DB)', () => {
  it('GET /skills returns the workspace skills through the Skill response schema', async () => {
    const { db } = stubDb([seededSkill]);
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: seededSkill.id,
        name: 'pr-quality-rubric',
        description: 'Score each change on scope, tests and blast radius.',
        type: 'rubric',
        source: 'manual',
        body: seededSkill.body,
        enabled: true,
        version: 1,
        evidence_files: null,
      },
    ]);
    await app.close();
  });

  it('POST /skills derives the name from the body and defaults type/source (D1, §3.1)', async () => {
    const { db, inserted } = stubDb([]);
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { body: '# Test Coverage Nudge\n\nAsk for the missing branch test.' },
    });
    expect(res.statusCode).toBe(201);
    expect(inserted[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      name: 'Test Coverage Nudge',
      description: 'Ask for the missing branch test.',
      type: 'custom',
      source: 'manual',
      enabled: true,
      version: 1,
    });
    await app.close();
  });

  it('POST /skills never takes `source` from the client — the checkbox decides (D2)', async () => {
    const { db, inserted } = stubDb([]);
    const app = await buildApp({ config, db, overrides: { auth } });

    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      // A client claiming `manual` for a third-party body must not be believed.
      payload: {
        name: 'secret-leakage-gate',
        body: 'Flag any token committed to a fixture.',
        source: 'manual',
        enabled: true,
        source_is_external: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(inserted[0]).toMatchObject({ source: 'imported_url', enabled: false });
    expect(res.json()).toMatchObject({ source: 'imported_url', enabled: false });
    await app.close();
  });

  it('rejects a malformed create body, a non-uuid id and a non-numeric version at the edge', async () => {
    const { db } = stubDb([]);
    const app = await buildApp({ config, db, overrides: { auth } });

    const noBody = await app.inject({ method: 'POST', url: '/skills', payload: { name: 'x' } });
    expect(noBody.statusCode).toBe(422);
    expect(noBody.json().error.code).toBe('validation_error');

    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid' })).statusCode).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/skills/${seededSkill.id}/versions/abc/restore`,
        })
      ).statusCode,
    ).toBe(422);
    await app.close();
  });
});
