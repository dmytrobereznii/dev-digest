import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  RATELIMIT_PATCH,
  WEBHOOKS_PATCH,
  CONFIG_PATCH,
  USERS_PATCH,
} from './seed-diffs.js';
import { DEMO_PRS, seedDemoPr } from './seed-prs/index.js';
import { SEED_SKILLS, SEED_SKILL_AGENTS, LESSON_AGENT_MODEL } from './seed-skills.js';

/**
 * The demo PR's changed files, with their unified-diff patches. A row whose
 * `patch` is null is SKIPPED when the reviewer reconstructs the diff (the demo
 * repo is never cloned, so that reconstruction is the only source), which
 * leaves every agent reviewing an empty diff.
 */
const DEMO_PR_FILES = [
  { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0, patch: RATELIMIT_PATCH },
  { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6, patch: WEBHOOKS_PATCH },
  { path: 'src/config.ts', additions: 4, deletions: 0, patch: CONFIG_PATCH },
  { path: 'src/api/users.ts', additions: 7, deletions: 2, patch: USERS_PATCH },
] as const;

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Then the demo PRs from `./seed-prs/` (#479, #486, #474), which widen the
 * fixture set across size and quality. Unlike #482 they ship UNREVIEWED — the
 * review surface is filled by running a real agent against them. #482 keeps
 * its own block above, sample review included, because the e2e flows pin its
 * exact values.
 *
 * Then L02's Skills Lab fixtures (`./seed-skills.ts`): four skills — one of
 * them third-party and disabled, one with two versions — plus the two lesson
 * agents that link them.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset of the 9 changed files)
    await db
      .insert(t.prFiles)
      .values(DEMO_PR_FILES.map((f) => ({ prId: pr!.id, ...f })));

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- demo PR files: reconcile, don't just insert-once ----
  // A DB seeded before the patches existed (or a fork whose demo PR came in
  // without them) already has the PR row, so the block above is skipped and the
  // rows keep a null patch. Reconcile every run so the fixtures are the source
  // of truth: insert a missing file, refresh an existing one.
  for (const f of DEMO_PR_FILES) {
    const [existing] = await db
      .select()
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, f.path)));
    if (existing) {
      await db
        .update(t.prFiles)
        .set({ additions: f.additions, deletions: f.deletions, patch: f.patch })
        .where(eq(t.prFiles.id, existing.id));
    } else {
      await db.insert(t.prFiles).values({ prId: pr!.id, ...f });
    }
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- L02: the Skills Lab fixtures + the two lesson agents ----
  // Idempotent like everything above: a skill or agent is written once, by
  // name. An existing row is left alone — the point of the seed is a usable
  // first boot, not overwriting whatever the user has since edited.
  const skillIdByName = new Map<string, string>();
  for (const sk of SEED_SKILLS) {
    let [row] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (!row) {
      const live = sk.versions[sk.versions.length - 1]!;
      [row] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: sk.name,
          description: sk.description,
          type: sk.type,
          source: sk.source,
          body: live.body,
          enabled: sk.enabled,
          version: sk.versions.length,
        })
        .returning();
      // History, oldest first — v1 … vN, where vN is the live body. Seeding
      // more than one version is what makes the Versions tab non-trivial on
      // first boot.
      await db.insert(t.skillVersions).values(
        sk.versions.map((v, i) => ({
          skillId: row!.id,
          version: i + 1,
          body: v.body,
          note: v.note,
        })),
      );
    }
    skillIdByName.set(sk.name, row!.id);
  }

  // Both lesson agents override DEFAULT_MODEL — see LESSON_AGENT_MODEL's note.
  for (const a of SEED_SKILL_AGENTS) {
    let [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!agent) {
      [agent] = await db
        .insert(t.agents)
        .values({
          workspaceId,
          name: a.name,
          description: a.description,
          provider: DEFAULT_PROVIDER,
          model: LESSON_AGENT_MODEL,
          systemPrompt: a.systemPrompt,
          enabled: true,
          version: 1,
          createdBy: userId,
        })
        .returning();
    }
    // Links are upserted by (agentId, skillId) so the seed can re-run; `order`
    // is the array index, which is the order the bodies reach the prompt.
    for (const [order, skillName] of a.skills.entries()) {
      const skillId = skillIdByName.get(skillName);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent!.id, skillId, order })
        .onConflictDoNothing();
    }
  }

  // ---- the run behind the sample review ----
  // Separate from the PR block above (and self-healing) on purpose: the sample
  // review predates agent_runs, so DBs seeded earlier have a review with no
  // run. Without a run there is no duration/token/cost to show, and the Cost
  // column, the timeline meta line and the trace drawer all read "—".
  const [seedReview] = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.model, 'seed')));
  if (seedReview && !seedReview.runId) {
    const [securityAgent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId: pr!.id,
        agentId: securityAgent?.id ?? null,
        ranAt: seedReview.createdAt,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        durationMs: 8200,
        tokensIn: 14820,
        tokensOut: 1240,
        costUsd: 0.014,
        status: 'done',
        source: 'local',
        findingsCount: 2,
        grounding: '2/2 passed',
        score: seedReview.score,
        blockers: 1,
      })
      .returning();
    // agentId too, so the review accordion names the agent instead of "Agent".
    await db
      .update(t.reviews)
      .set({ runId: run!.id, agentId: securityAgent?.id ?? null })
      .where(eq(t.reviews.id, seedReview.id));
    await db.insert(t.runTraces).values({
      runId: run!.id,
      trace: {
        config: {
          agent: 'Security Reviewer',
          version: '1',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          pr: 482,
          source: 'local',
        },
        stats: {
          duration_ms: 8200,
          tokens_in: 14820,
          tokens_out: 1240,
          cost_usd: 0.014,
          findings: 2,
          grounding: '2/2 passed',
        },
        prompt_assembly: {
          system: 'You are a security-focused PR reviewer.',
          skills: null,
          memory: null,
          specs: null,
          user: 'Review pull request #482 "Add rate limiting to public API endpoints".',
        },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [{ t: '00.00', kind: 'info', msg: 'Seeded run (no LLM call was made)' }],
      },
    });
  }

  // ---- the rest of the demo PRs ----
  // Declarative fixtures under ./seed-prs/, written by one generic seeder.
  // Runs last so the built-in agents exist to attribute their runs to.
  const agentRows = await db
    .select({ id: t.agents.id, name: t.agents.name })
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId));
  const agentIdByName = new Map(agentRows.map((a) => [a.name, a.id]));

  for (const fixture of DEMO_PRS) {
    await seedDemoPr(db, {
      workspaceId,
      repoId,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      agentIdByName,
    }, fixture);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
