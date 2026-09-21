import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * The conventions extractor over a real Postgres. Covers what only SQL can get
 * wrong, and deliberately nothing the unit lane already covers:
 *
 *  - a scan is a row, and the candidates hang off it (D4);
 *  - the pending/settled split — `GET` hides `rejected` while the row survives,
 *    and a re-scan replaces `pending` without touching a settled decision (D3);
 *  - "Accept all" moves every LISTED row and cannot reach a rejected one (D2);
 *  - the merge writes `source: 'extracted'` as v1 with one snapshot (D8), and
 *    the resulting skill reaches a review prompt UNWRAPPED (D9) — the assertion
 *    that pins the trust decision, since nothing else in the code says the body
 *    of an extracted skill is treated as instructions rather than data;
 *  - workspace scoping on every route.
 *
 * The gate itself is pure and lives in `modules/conventions/helpers.test.ts`;
 * the route shapes are `modules/conventions/routes.test.ts`. Neither needs Docker.
 */

// ---- the sampled clone -----------------------------------------------------
// Two files with quotable text, so the gate has something real to ground
// against. `MockGitClient.readFile` answers `''` for any path with no fixture,
// which is how the service's config-file probing is meant to come up empty.

const PAYMENTS_TS = [
  "import { logger } from '../lib/logger';",
  '',
  'export async function capture(id: string) {',
  '  const charge = await gateway.capture(id);',
  '  return charge;',
  '}',
].join('\n');

const REDIS_TS = [
  "import Redis from 'ioredis';",
  "import { config } from '../config';",
  '',
  'export const redis = new Redis(config.redisUrl);',
].join('\n');

const FILES = {
  'src/services/payments.ts': PAYMENTS_TS,
  'src/lib/redis.ts': REDIS_TS,
};

/** repo-intel is stubbed to the one method the extractor calls. */
const repoIntel = {
  getConventionSamples: async () => ['src/services/payments.ts', 'src/lib/redis.ts'],
} as unknown as RepoIntel;

const AWAIT_RULE = 'Always use `async/await` instead of raw Promise chains';
const REDIS_RULE = 'Redis access goes through the src/lib/redis.ts singleton';

/** One rule per file, both groundable, plus one fabricated quote for the gate. */
const EXTRACTION = {
  conventions: [
    {
      rule: AWAIT_RULE,
      // A deliberately WRONG line range: the gate repairs it from where the text
      // actually is rather than dropping good evidence over arithmetic (D6).
      evidence_path: 'src/services/payments.ts:118-140',
      evidence_snippet: '  const charge = await gateway.capture(id);',
      confidence: 0.91,
    },
    {
      rule: REDIS_RULE,
      evidence_path: 'src/lib/redis.ts:4',
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.78,
    },
    {
      rule: 'Every handler is wrapped in a circuit breaker',
      evidence_path: 'src/services/payments.ts:1-3',
      evidence_snippet: 'const breaker = new CircuitBreaker(handler);',
      confidence: 0.64,
    },
  ],
};

/** A second response, to prove what a re-scan keeps and what it replaces (D3). */
const RESCAN = {
  conventions: [
    // The SAME two rules the first scan produced, re-phrased only in casing and
    // punctuation — `dedupeKey` must collapse them against the settled rows.
    {
      rule: 'always use `Async/Await` instead of raw promise chains!!',
      evidence_path: 'src/services/payments.ts:4',
      evidence_snippet: '  const charge = await gateway.capture(id);',
      confidence: 0.93,
    },
    {
      rule: 'REDIS access goes through the src/lib/redis.ts singleton.',
      evidence_path: 'src/lib/redis.ts:4',
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.8,
    },
    // …and one genuinely new one, which is the only row that may be inserted.
    {
      rule: 'Import the logger rather than calling console directly',
      evidence_path: 'src/services/payments.ts:1',
      evidence_snippet: "import { logger } from '../lib/logger';",
      confidence: 0.7,
    },
  ],
};

/** A review fixture for the D9 trust assertion; one finding that grounds. */
const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'One convention violation.',
  score: 70,
  findings: [
    {
      id: 'f-1',
      severity: 'WARNING',
      category: 'style',
      title: 'Promise chain where the house style is async/await',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'The repo conventions require async/await.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

interface Candidate {
  id: string;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  confidence: number;
  accepted: boolean;
  status: 'pending' | 'accepted' | 'rejected';
}
interface Page {
  scan: { id: string; sample_count: number; model: string; created_at: string } | null;
  candidates: Candidate[];
}

d('/conventions', () => {
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

  /**
   * A repo per test, each WITH a `clonePath` — the seeded `acme/payments-api`
   * has none, which is its own test below. `repoSeq` keeps the `(workspace,
   * full_name)` unique index happy.
   */
  let repoSeq = 0;
  async function makeRepo(ownerWorkspaceId = workspaceId) {
    const name = `conv-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: ownerWorkspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: `/mock/clones/acme/${name}`,
      })
      .returning();
    return repo!;
  }

  /**
   * TWO provider slots, and both are load-bearing. The extractor resolves
   * `openrouter` from the `conventions` feature-model default (D11), while a
   * review agent created below runs on `openai` — inject only one and the other
   * path tries to build a real client, fails on the missing key, and the run
   * dies before a prompt is ever assembled (which is exactly how the D9 test
   * first failed: `prompt_assembly.skills` was null, not unwrapped).
   */
  function makeApp(structured: unknown = EXTRACTION) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES, diff: DIFF }),
        repoIntel,
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: structured },
          }),
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
        },
      },
    });
  }

  const get = async (app: Awaited<ReturnType<typeof makeApp>>, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as Page;

  async function extract(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    return res.json() as Page;
  }

  it('extract persists a scan row and only the candidates that ground', async () => {
    const app = await makeApp();
    const repo = await makeRepo();

    // Before the first scan there is no scan row at all — `null`, not an empty
    // object, because that is the signal the page's empty state reads (D4).
    expect(await get(app, repo.id)).toEqual({ scan: null, candidates: [] });

    const page = await extract(app, repo.id);

    // Two of the three survived; the fabricated quote was dropped by the gate.
    expect(page.candidates).toHaveLength(2);
    expect(page.candidates.map((c) => c.rule)).toEqual([AWAIT_RULE, REDIS_RULE]);
    expect(page.candidates.every((c) => c.status === 'pending' && !c.accepted)).toBe(true);

    // The scan is a row, with the file count the sampler actually read.
    expect(page.scan).not.toBeNull();
    expect(page.scan!.sample_count).toBe(2);
    expect(page.scan!.model).toBe('anthropic/claude-haiku-4.5');

    // The wrong line range was REPAIRED to where the snippet really is, not
    // discarded — `capture` is on line 4 of the fixture.
    const awaitRule = page.candidates.find((c) => c.rule === AWAIT_RULE)!;
    expect(awaitRule.evidence_path).toBe('src/services/payments.ts:4');

    // Every candidate hangs off that scan in the DB.
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repo.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.scanId === page.scan!.id)).toBe(true);

    await app.close();
  });

  it('a repo with no clone is a 422, not an empty scan', async () => {
    const app = await makeApp();
    const [seeded] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));

    // The seeded demo repo is inserted with `clonePath: null` and is never
    // cloned, so this is the first thing a fresh install hits.
    expect(seeded!.clonePath).toBeNull();

    // `seed.ts` ships ONE scan row and three candidates for this repo on
    // purpose (§5): the button can only fail here, so the page is populated with
    // the output of a scan that "already ran". Which means the assertion below
    // has to be that the 422 created no NEW scan — not that none exists.
    const before = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, seeded!.id));
    expect(before).toHaveLength(1);
    expect(before[0]!.sampleCount).toBe(84);

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${seeded!.id}/conventions/extract`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/no local clone/i);

    // It refused BEFORE recording anything: a scan that never ran leaves no row,
    // so the subtitle keeps reporting the seeded one rather than a 0-file scan.
    const after = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, seeded!.id));
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);

    await app.close();
  });

  it('reject hides the row from GET but keeps it in the database', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const page = await extract(app, repo.id);
    const victim = page.candidates[0]!;

    const res = await app.inject({
      method: 'PUT',
      url: `/conventions/${victim.id}`,
      payload: { status: 'rejected' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'rejected', accepted: false });

    // Gone from the list the page receives…
    const after = await get(app, repo.id);
    expect(after.candidates.map((c) => c.id)).not.toContain(victim.id);
    expect(after.candidates).toHaveLength(1);

    // …but still a row, which is the whole point of persisting a rejection (D3).
    const [row] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, victim.id));
    expect(row!.status).toBe('rejected');

    await app.close();
  });

  it('accept toggles `accepted` in lockstep with `status`, and survives a re-read', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const page = await extract(app, repo.id);
    const target = page.candidates[0]!;

    await app.inject({
      method: 'PUT',
      url: `/conventions/${target.id}`,
      payload: { status: 'accepted' },
    });

    // `accepted` is DERIVED and never written on its own — the card's left
    // border reads it, so a row where the two disagree renders a lie.
    const [row] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, target.id));
    expect(row).toMatchObject({ status: 'accepted', accepted: true });

    const reread = await get(app, repo.id);
    expect(reread.candidates.find((c) => c.id === target.id)).toMatchObject({
      status: 'accepted',
      accepted: true,
    });

    await app.close();
  });

  it('Accept all moves every LISTED row and cannot reach a rejected one', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const page = await extract(app, repo.id);
    const [first, second] = page.candidates as [Candidate, Candidate];

    await app.inject({
      method: 'PUT',
      url: `/conventions/${first.id}`,
      payload: { status: 'rejected' },
    });

    const accepted = (
      await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/conventions/status`,
        payload: { status: 'accepted' },
      })
    ).json() as Candidate[];

    // Only the surviving row is returned, and it is accepted.
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ id: second.id, status: 'accepted', accepted: true });

    // The rejected row was NOT resurrected by a bulk update.
    const [rejected] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, first.id));
    expect(rejected).toMatchObject({ status: 'rejected', accepted: false });

    // Deselect all puts the listed rows back to pending; `rejected` is not a
    // value this route accepts at all, so there is no bulk reject to reach for.
    const deselected = (
      await app.inject({
        method: 'PUT',
        url: `/repos/${repo.id}/conventions/status`,
        payload: { status: 'accepted' },
      })
    ).json() as Candidate[];
    expect(deselected).toHaveLength(1);

    const bad = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/conventions/status`,
      payload: { status: 'rejected' },
    });
    expect(bad.statusCode).toBe(422);

    await app.close();
  });

  it('re-scan replaces pending, keeps settled rows, and does not re-propose them', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const first = await extract(app, repo.id);
    const [keep, drop] = first.candidates as [Candidate, Candidate];

    // Settle both: one accepted (it may already be inside a saved skill), one
    // rejected (the user has thrown it away).
    await app.inject({
      method: 'PUT',
      url: `/conventions/${keep.id}`,
      payload: { status: 'accepted' },
    });
    await app.inject({
      method: 'PUT',
      url: `/conventions/${drop.id}`,
      payload: { status: 'rejected' },
    });

    // A second scan whose response re-proposes both settled rules (in different
    // casing and punctuation) plus one genuinely new rule.
    const rescanApp = await makeApp(RESCAN);
    const second = await extract(rescanApp, repo.id);

    // The accepted row survives; the re-proposed duplicates are suppressed by
    // `dedupeKey`; exactly one new candidate was inserted.
    const rules = second.candidates.map((c) => c.rule);
    expect(rules).toContain(AWAIT_RULE);
    expect(rules).toContain('Import the logger rather than calling console directly');
    expect(second.candidates).toHaveLength(2);

    // The accepted row kept its decision AND its original phrasing — it was not
    // replaced by the re-scan's re-wording of the same rule.
    expect(second.candidates.find((c) => c.rule === AWAIT_RULE)).toMatchObject({
      id: keep.id,
      status: 'accepted',
    });

    // The rejected rule is not back in the list, and not back in the DB either.
    expect(rules).not.toContain(REDIS_RULE);
    const redisRows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repo.id), eq(t.conventions.rule, REDIS_RULE)));
    expect(redisRows).toHaveLength(1);
    expect(redisRows[0]!.status).toBe('rejected');

    await app.close();
    await rescanApp.close();
  });

  it('the merge writes source: extracted as v1 with one snapshot, and links to an agent', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const page = await extract(app, repo.id);
    const ids = page.candidates.map((c) => c.id);

    const BODY = `# ${repo.name}-conventions\n\n## async-await-promise-chains\nEdited by hand in the modal.`;
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: `${repo.name}-conventions`,
        description: '2 house conventions extracted',
        type: 'convention',
        enabled: true,
        body: BODY,
        convention_ids: ids,
      },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();

    // Provenance is the server's to decide, and the client never named it.
    expect(skill).toMatchObject({
      source: 'extracted',
      type: 'convention',
      enabled: true,
      version: 1,
      body: BODY,
    });

    // Exactly one snapshot, like any other v1.
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, note: null });

    // It is an ordinary skill from here on: linkable to an agent.
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ConvAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'c' },
      })
    ).json();
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    expect(linked.statusCode).toBe(200);
    expect(
      ((await app.inject({ method: 'GET', url: `/skills/${skill.id}/agents` })).json() as {
        name: string;
      }[]).map((a) => a.name),
    ).toEqual(['ConvAgent']);

    // A candidate id from another repo is refused — the ids are checked, not
    // trusted, so a skill cannot be attributed to rows this repo never had.
    const other = await makeRepo();
    const otherPage = await extract(app, other.id);
    const cross = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'cross-tenant',
        type: 'convention',
        enabled: true,
        body: '# cross\n\nnope',
        convention_ids: [otherPage.candidates[0]!.id],
      },
    });
    expect(cross.statusCode).toBe(422);

    await app.close();
  });

  /**
   * D9, and the reason this test exists: an extracted body is TRUSTED, so it
   * reaches the prompt as instructions under its own heading rather than as data
   * inside `<untrusted>`. Nothing else in the codebase states that — the
   * predicate is a two-value allowlist in `modules/reviews/helpers.ts` — so this
   * assertion is what stops a future "tighten the trust rule" change from
   * silently re-wrapping every extracted skill.
   */
  it('an extracted skill reaches the review prompt UNWRAPPED', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const page = await extract(app, repo.id);

    const MARKER = 'Flag raw Promise chains; this repo is async/await throughout.';
    const skill = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repo.id}/conventions/skill`,
        payload: {
          name: 'extracted-house-rules',
          type: 'convention',
          enabled: true,
          body: `# extracted-house-rules\n\n${MARKER}`,
          convention_ids: page.candidates.map((c) => c.id),
        },
      })
    ).json();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'TrustAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'd9' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    // A PR to review, on the same repo.
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 901,
        title: 'Refactor payment capture',
        author: 'marisa.koch',
        branch: 'feat/capture',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const run = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr!.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const trace = (
      await app.inject({ method: 'GET', url: `/runs/${run.runs[0].run_id}/trace` })
    ).json();
    const skills: string = trace.prompt_assembly.skills;

    expect(skills).not.toBeNull();
    // Its own heading, and the body verbatim…
    expect(skills).toContain('## extracted-house-rules');
    expect(skills).toContain(MARKER);
    // …with no `<untrusted>` wrapper anywhere near it.
    expect(skills).not.toContain('<untrusted source="skill:extracted-house-rules">');
    expect(skills).not.toContain('<untrusted');

    await app.close();
  });

  it('every route is workspace-scoped', async () => {
    const app = await makeApp();

    // A repo that exists, in a workspace the request is not in.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `tenant-${repoSeq}` })
      .returning();
    const foreign = await makeRepo(otherWs!.id);

    // Give it a candidate, so "not found" cannot pass by accident.
    const foreignApp = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        repoIntel,
        auth: {
          currentUser: async () => ({ id: 'u', email: 'x@local', name: 'X' }),
          currentWorkspace: async () => ({ id: otherWs!.id, name: otherWs!.name }),
        },
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: EXTRACTION },
          }),
        },
      },
    });
    const seededForeign = await extract(foreignApp, foreign.id);
    const foreignCandidate = seededForeign.candidates[0]!;

    // …and none of it is reachable from the default workspace.
    for (const call of [
      { method: 'GET' as const, url: `/repos/${foreign.id}/conventions` },
      { method: 'POST' as const, url: `/repos/${foreign.id}/conventions/extract` },
      {
        method: 'PUT' as const,
        url: `/repos/${foreign.id}/conventions/status`,
        payload: { status: 'accepted' },
      },
    ]) {
      const res = await app.inject(call);
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(404);
    }

    const patch = await app.inject({
      method: 'PUT',
      url: `/conventions/${foreignCandidate.id}`,
      payload: { status: 'rejected' },
    });
    expect(patch.statusCode).toBe(404);

    const merge = await app.inject({
      method: 'POST',
      url: `/repos/${foreign.id}/conventions/skill`,
      payload: {
        name: 'nope',
        type: 'convention',
        enabled: true,
        body: '# nope\n\nnope',
        convention_ids: [foreignCandidate.id],
      },
    });
    expect(merge.statusCode).toBe(404);

    // The foreign candidate was untouched by any of it.
    const [still] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, foreignCandidate.id));
    expect(still!.status).toBe('pending');

    await app.close();
    await foreignApp.close();
  });
});
