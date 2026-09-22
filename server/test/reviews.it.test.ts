import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // Cost is carried from the engine to every surface that shows it: the run
    // row (PR-list total), the trace stats (drawer COST tile) and the review
    // DTO (accordion badge). MockLLMProvider bills 0.001 per completion.
    expect(run!.costUsd).toBeGreaterThan(0);
    expect(run!.costUsd! % 0.001).toBeCloseTo(0, 6);
    expect(trace.stats.cost_usd).toBeCloseTo(run!.costUsd!, 10);
    expect(review.cost_usd).toBeCloseTo(run!.costUsd!, 10);

    await app.close();
  });

  it('deleting a run cascades to its review, its findings and its trace', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Cascade', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const body = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    const runId: string = body.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    expect(review).toBeDefined();
    const reviewId = review!.id;
    const before = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, reviewId));
    expect(before.length).toBeGreaterThan(0);

    const del = await app.inject({ method: 'DELETE', url: `/runs/${runId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    // The database does this, not the repository: reviews.run_id references
    // agent_runs ON DELETE CASCADE, and findings already cascaded from reviews.
    // deleteAgentRun issues exactly one DELETE, against agent_runs.
    expect(
      await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.id, reviewId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId)),
    ).toHaveLength(0);

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  /**
   * D6 — the two gates on inclusion, asserted at the only level that proves
   * them: a real run's persisted trace. A skill's body reaches the prompt IFF
   * it is linked to the running agent AND `skills.enabled` is true. This is the
   * assertion the whole lesson rests on (spec 01-skills §8) — the control
   * experiment on camera is "same agent, same PR, skill linked vs not".
   */
  it('a run includes ONLY linked AND enabled skills, wrapping the untrusted one (D6)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // trusted + enabled → plain `## <name>` heading, body verbatim.
    const trusted = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'd6-trusted-skill',
          description: 'Applies always.',
          body: 'Prefer explicit null checks over truthiness.',
        },
      })
    ).json();
    expect(trusted.source).toBe('manual');
    expect(trusted.enabled).toBe(true);

    // third-party + enabled → body delimiter-wrapped as untrusted DATA. The
    // provenance checkbox forces enabled:false, so vetting it is a second,
    // explicit act — which is exactly the point of D2.
    const untrusted = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'd6-untrusted-skill',
          description: 'Came from elsewhere.',
          body: 'Detect sk_live_ keys in the diff.',
          source_is_external: true,
        },
      })
    ).json();
    expect(untrusted.source).toBe('imported_url');
    expect(untrusted.enabled).toBe(false);
    await app.inject({
      method: 'PUT',
      url: `/skills/${untrusted.id}`,
      payload: { enabled: true },
    });

    // linked but globally disabled → contributes nothing and leaves no trace of
    // itself. The global toggle is a kill switch across every agent.
    const disabled = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'd6-disabled-skill',
          description: 'Switched off globally.',
          body: 'THIS_BODY_MUST_NOT_REACH_THE_PROMPT',
        },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${disabled.id}`,
      payload: { enabled: false },
    });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'D6Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'd6' },
      })
    ).json();

    // All THREE are linked; only two are enabled.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [trusted.id, untrusted.id, disabled.id] },
    });

    const body = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const skillsBlock: string = trace.prompt_assembly.skills;

    // ONE Skills block holding both enabled skills, each under its own heading.
    expect(skillsBlock).not.toBeNull();
    expect(skillsBlock).toContain('## d6-trusted-skill');
    expect(skillsBlock).toContain('## d6-untrusted-skill');

    // The trusted body is verbatim and NOT wrapped.
    expect(skillsBlock).toContain('Prefer explicit null checks over truthiness.');
    expect(skillsBlock).not.toContain('<untrusted source="skill:d6-trusted-skill">');

    // The third-party body IS wrapped — the model is told it is data.
    expect(skillsBlock).toContain('<untrusted source="skill:d6-untrusted-skill">');

    // The disabled skill left no trace of itself anywhere in the prompt.
    expect(skillsBlock).not.toContain('d6-disabled-skill');
    expect(skillsBlock).not.toContain('THIS_BODY_MUST_NOT_REACH_THE_PROMPT');
    expect(trace.prompt_assembly.user).not.toContain('THIS_BODY_MUST_NOT_REACH_THE_PROMPT');

    // The Configuration section names exactly the skills that reached the prompt.
    expect(trace.config.skills).toEqual(['d6-trusted-skill', 'd6-untrusted-skill']);

    await app.close();
  });

  /**
   * Acceptance #12 — an agent with no linked skills produces a prompt with no
   * `## Skills / rules` section at all, byte-identical to the pre-skills shape.
   * This is what makes the control experiment a comparison rather than a claim.
   */
  it('an agent with no linked skills produces no Skills section at all', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'BareAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'bare' },
      })
    ).json();

    const body = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(trace.config.skills).toEqual([]);

    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
