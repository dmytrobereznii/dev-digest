import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockDocumentReader, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/**
 * Project Context over a real Postgres: document listing through the service,
 * and the agent / skill attachment tables (order, cascade, usage counts).
 */
d('project context', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seedRepoId: string;
  const reader = new MockDocumentReader();
  const tokenizer = new TiktokenTokenizer();
  let counter = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [r] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    seedRepoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(() => {
    reader.files = {
      'docs/guide.md': '# Guide\n\nHow to do the thing.',
      '.context/specs/plan.md': '# Plan\n\nStep one. Step two.',
      'README.md': '# not a doc type but listed by the reader',
    };
  });

  function makeApp() {
    const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), documents: reader },
    });
  }

  async function newRepo(clonePath: string | null = '/clones/fake') {
    const n = ++counter;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'ctx',
        name: `repo-${n}`,
        fullName: `ctx/repo-${n}`,
        clonePath,
      })
      .returning();
    return row!.id;
  }

  async function newAgent() {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `ctx-agent-${++counter}`,
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'review',
      })
      .returning();
    return row!;
  }

  async function newSkill(enabled = true) {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `ctx-skill-${++counter}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: '# s',
        enabled,
      })
      .returning();
    return row!;
  }

  const attach = (
    app: Awaited<ReturnType<typeof makeApp>>,
    owner: 'agents' | 'skills',
    id: string,
    repo_id: string,
    path: string,
  ) => app.inject({ method: 'POST', url: `/${owner}/${id}/context`, payload: { repo_id, path } });

  const listDocs = async (app: Awaited<ReturnType<typeof makeApp>>, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json() as {
      status: string;
      documents: Array<{ path: string; type: string; tokens: number; used_by_agents: number }>;
    };

  it('list returns path, type and tokens for each document', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.documents).toEqual([
      { path: '.context/specs/plan.md', type: 'specs', tokens: tokenizer.count(reader.files['.context/specs/plan.md']!), used_by_agents: 0 },
      { path: 'README.md', type: 'other', tokens: tokenizer.count(reader.files['README.md']!), used_by_agents: 0 },
      { path: 'docs/guide.md', type: 'docs', tokens: tokenizer.count(reader.files['docs/guide.md']!), used_by_agents: 0 },
    ]);
    await app.close();
  });

  it('token counts follow the file content at request time', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const before = (await listDocs(app, repoId)).documents.find((x) => x.path === 'docs/guide.md')!;

    const longer = 'word '.repeat(500);
    reader.files['docs/guide.md'] = longer;

    const after = (await listDocs(app, repoId)).documents.find((x) => x.path === 'docs/guide.md')!;
    expect(after.tokens).toBe(tokenizer.count(longer));
    expect(after.tokens).toBeGreaterThan(before.tokens);

    const content = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/context/content?path=docs/guide.md` })
    ).json();
    expect(content).toEqual({ path: 'docs/guide.md', content: longer, tokens: after.tokens });
    await app.close();
  });

  it('a repository with no clone returns not_cloned and no documents', async () => {
    const app = await makeApp();
    const repoId = await newRepo(null);
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'not_cloned', documents: [] });
    // the untouched seeded demo repo behaves the same
    expect((await listDocs(app, seedRepoId)).status).toBe('not_cloned');
    await app.close();
  });

  it('content for a path outside the list is 404 with no content', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    for (const path of ['../../etc/passwd', 'not/listed.md']) {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/content?path=${encodeURIComponent(path)}`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('"content"');
    }
    // no clone at all: nothing is readable either
    const bare = await newRepo(null);
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${bare}/context/content?path=docs/guide.md`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('a file added on disk appears in the next list with no git sync', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    expect((await listDocs(app, repoId)).documents.map((x) => x.path)).not.toContain('docs/new.md');

    reader.files['docs/new.md'] = '# New';
    const after = await listDocs(app, repoId);
    expect(after.documents.map((x) => x.path)).toContain('docs/new.md');
    await app.close();
  });

  it('attach stores owner, repository and path and no document text', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();

    const a = await attach(app, 'agents', agent.id, repoId, 'docs/guide.md');
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual({ paths: ['docs/guide.md'] });
    const s = await attach(app, 'skills', skill.id, repoId, 'docs/guide.md');
    expect(s.json()).toEqual({ paths: ['docs/guide.md'] });

    const agentRows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agent.id));
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]).toMatchObject({ repoId, agentId: agent.id, path: 'docs/guide.md' });
    // only identifying columns exist; the document text is stored nowhere
    expect(Object.keys(agentRows[0]!).sort()).toEqual(['agentId', 'path', 'repoId', 'seq']);
    const skillRows = await pg.handle.db
      .select()
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skill.id));
    expect(Object.keys(skillRows[0]!).sort()).toEqual(['path', 'repoId', 'seq', 'skillId']);
    expect(JSON.stringify([agentRows, skillRows])).not.toContain('How to do the thing');

    const got = await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/context?repo_id=${repoId}`,
    });
    expect(got.json()).toEqual({ paths: ['docs/guide.md'] });
    await app.close();
  });

  it('detach deletes the attachment', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const agent = await newAgent();
    await attach(app, 'agents', agent.id, repoId, 'docs/guide.md');
    await attach(app, 'agents', agent.id, repoId, 'README.md');

    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agent.id}/context?repo_id=${repoId}&path=${encodeURIComponent('docs/guide.md')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ paths: ['README.md'] });
    const rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agent.id));
    expect(rows.map((r) => r.path)).toEqual(['README.md']);
    await app.close();
  });

  it('attachments are returned in attach order; re-attaching moves a path to the end', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    for (const p of ['docs/guide.md', 'README.md', '.context/specs/plan.md']) {
      await attach(app, 'agents', agent.id, repoId, p);
      await attach(app, 'skills', skill.id, repoId, p);
    }
    const order = (o: string, id: string) =>
      app
        .inject({ method: 'GET', url: `/${o}/${id}/context?repo_id=${repoId}` })
        .then((r) => r.json().paths);
    // attach order, not alphabetical
    expect(await order('agents', agent.id)).toEqual([
      'docs/guide.md',
      'README.md',
      '.context/specs/plan.md',
    ]);

    const again = await attach(app, 'agents', agent.id, repoId, 'docs/guide.md');
    expect(again.json().paths).toEqual(['README.md', '.context/specs/plan.md', 'docs/guide.md']);
    await attach(app, 'skills', skill.id, repoId, 'README.md');
    expect(await order('skills', skill.id)).toEqual([
      'docs/guide.md',
      '.context/specs/plan.md',
      'README.md',
    ]);
    await app.close();
  });

  it('attach of an unlisted path is 422 and stores nothing', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const agent = await newAgent();
    const res = await attach(app, 'agents', agent.id, repoId, 'docs/missing.md');
    expect(res.statusCode).toBe(422);
    const rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agent.id));
    expect(rows).toEqual([]);
    await app.close();
  });

  it('attach and detach leave the owner version unchanged', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    await attach(app, 'agents', agent.id, repoId, 'docs/guide.md');
    await attach(app, 'skills', skill.id, repoId, 'docs/guide.md');
    await app.inject({
      method: 'DELETE',
      url: `/agents/${agent.id}/context?repo_id=${repoId}&path=docs%2Fguide.md`,
    });
    await app.inject({
      method: 'DELETE',
      url: `/skills/${skill.id}/context?repo_id=${repoId}&path=docs%2Fguide.md`,
    });
    const [a] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    const [s] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(a!.version).toBe(agent.version);
    expect(s!.version).toBe(skill.version);
    const versions = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agent.id));
    expect(versions).toEqual([]);
    await app.close();
  });

  it('deleting an agent, a skill or a repository deletes its attachments', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const doomedRepo = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    const keeper = await newAgent();
    await attach(app, 'agents', agent.id, repoId, 'docs/guide.md');
    await attach(app, 'agents', keeper.id, repoId, 'docs/guide.md');
    await attach(app, 'skills', skill.id, repoId, 'docs/guide.md');
    await attach(app, 'agents', keeper.id, doomedRepo, 'README.md');
    await attach(app, 'skills', skill.id, doomedRepo, 'README.md');

    const agentRows = () => pg.handle.db.select().from(t.agentContextDocs);
    const skillRows = () => pg.handle.db.select().from(t.skillContextDocs);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect((await agentRows()).filter((r) => r.agentId === agent.id)).toEqual([]);
    expect((await agentRows()).filter((r) => r.agentId === keeper.id)).toHaveLength(2);

    expect((await app.inject({ method: 'DELETE', url: `/repos/${doomedRepo}` })).statusCode).toBe(200);
    expect((await agentRows()).filter((r) => r.repoId === doomedRepo)).toEqual([]);
    expect((await skillRows()).filter((r) => r.repoId === doomedRepo)).toEqual([]);
    expect((await skillRows()).filter((r) => r.skillId === skill.id)).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await skillRows()).filter((r) => r.skillId === skill.id)).toEqual([]);
    await app.close();
  });

  it('used_by_agents counts each agent once, direct or through an enabled linked skill', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const otherRepo = await newRepo();
    const both = await newAgent(); // direct AND via a skill AND via a second skill
    const viaSkill = await newAgent();
    const viaDisabled = await newAgent();
    const unlinked = await newAgent();
    const on1 = await newSkill(true);
    const on2 = await newSkill(true);
    const off = await newSkill(false);
    const db = pg.handle.db;
    await db.insert(t.agentSkills).values([
      { agentId: both.id, skillId: on1.id },
      { agentId: both.id, skillId: on2.id },
      { agentId: viaSkill.id, skillId: on1.id },
      { agentId: viaDisabled.id, skillId: off.id },
    ]);
    const p = 'docs/guide.md';
    await attach(app, 'agents', both.id, repoId, p);
    await attach(app, 'skills', on1.id, repoId, p);
    await attach(app, 'skills', on2.id, repoId, p);
    await attach(app, 'skills', off.id, repoId, p);
    await attach(app, 'skills', on1.id, otherRepo, 'README.md'); // other repo: not counted here
    await attach(app, 'agents', unlinked.id, otherRepo, p);

    const docs = (await listDocs(app, repoId)).documents;
    expect(docs.find((x) => x.path === p)!.used_by_agents).toBe(2); // both + viaSkill
    expect(docs.find((x) => x.path === 'README.md')!.used_by_agents).toBe(0);
    await app.close();
  });
});
