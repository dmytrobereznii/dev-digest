import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD over a real Postgres. Covers what only SQL can get wrong:
 * the body-only version rule and its `skill_versions` snapshots, restore as an
 * APPEND (never a rewind), the `agent_skills` cascade on delete, and workspace
 * scoping.
 */
d('/skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const V1_BODY = '# Api Contract Gate\n\nFlag breaking changes to a route signature.';
  const V2_BODY = '# Api Contract Gate\n\nFlag breaking changes to a route signature or status.';

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    payload: Record<string, unknown> = {},
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { body: V1_BODY, ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; name: string; source: string };
  }

  it('create derives the name from the # H1, stores v1 and one snapshot', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);

    expect(skill).toMatchObject({
      name: 'Api Contract Gate',
      description: 'Flag breaking changes to a route signature.',
      type: 'custom',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, note: null });
    await app.close();
  });

  it('honours the create form\'s Enabled toggle, but a third-party skill is always disabled', async () => {
    const app = await makeApp();

    // Unticking Enabled on a first-party skill must be respected. It was
    // silently ignored before: CreateSkillBody declared no `enabled`, so Zod
    // stripped what the modal sent and the skill was created switched ON.
    const off = (await createSkill(app, { enabled: false })) as unknown as {
      id: string;
      enabled: boolean;
    };
    expect(off.enabled).toBe(false);

    // Absent → enabled, as before.
    const dflt = (await createSkill(app)) as unknown as { enabled: boolean };
    expect(dflt.enabled).toBe(true);

    // D2 wins over the toggle: a third-party skill cannot be born enabled,
    // however eagerly the client asks. Vetting stays a second, explicit act.
    const external = (await createSkill(app, {
      enabled: true,
      source_is_external: true,
    })) as unknown as { enabled: boolean; source: string };
    expect(external).toMatchObject({ source: 'imported_url', enabled: false });

    await app.close();
  });

  it('the provenance checkbox stores imported_url + disabled, and update cannot change it (D2)', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { source_is_external: true });
    expect(skill.source).toBe('imported_url');
    expect(skill).toMatchObject({ enabled: false });

    // `source` / `source_is_external` are not in UpdateSkillBody — stripped, never applied.
    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { source: 'manual', source_is_external: false, enabled: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ source: 'imported_url', enabled: true });
    await app.close();
  });

  it('a body edit bumps version to 2 and snapshots both bodies with their notes', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: V2_BODY, note: 'Also cover status codes' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].note).toBe('Also cover status codes');
    expect(versions[1].note).toBeNull();

    const rows = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(rows.map((r) => r.body).sort()).toEqual([V1_BODY, V2_BODY].sort());
    await app.close();
  });

  it('a metadata-only edit does NOT version the skill', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'renamed', description: 'reworded', type: 'convention', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'renamed', type: 'convention', version: 1 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('restore writes a NEW version noted "Restored from vN" and keeps every row (D8)', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: V2_BODY, note: 'Also cover status codes' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: V1_BODY });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].note).toBe('Restored from v1');

    // 404 for a version that was never recorded, and for an unknown skill.
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/99/restore` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${ghost}/versions/1/restore` }))
        .statusCode,
    ).toBe(404);
    await app.close();
  });

  it('deleting a skill cascades its agent links, and /skills/:id/agents names them first', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'API Contract Reviewer',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json() as { id: string };

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const using = await app.inject({ method: 'GET', url: `/skills/${skill.id}/agents` });
    expect(using.statusCode).toBe(200);
    expect(using.json()).toEqual([{ id: agent.id, name: 'API Contract Reviewer' }]);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });

    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, skill.id)));
    expect(links).toHaveLength(0);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions).toHaveLength(0);

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('is workspace-scoped: another tenant can neither read, version nor delete a skill', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      type: 'custom',
      source: 'manual',
      body: V1_BODY,
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.restore(defaultWs!, foreign.id, 1)).toBeUndefined();
    expect(await service.agentsUsing(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.delete(defaultWs!, foreign.id)).toBe(false);
    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();

    // The default workspace's list never contains another tenant's skill.
    const visible = await service.list(defaultWs!);
    expect(visible.map((s) => s.id)).not.toContain(foreign.id);
  });
});
