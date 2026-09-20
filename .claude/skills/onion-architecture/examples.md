# onion-architecture — worked examples

Every pair below is real code from this repo, not invented. The "good" column
is the shape to copy; the "bad" column is either existing accepted debt (marked
**debt**) or a plausible mistake.

---

## 1. A route handler

### Good — `modules/agents/routes.ts:74`

```ts
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(app.container);

  app.get('/agents', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await service.get(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  });
}
```

Why it is right: params validated by a Zod schema at the edge; one service call
per handler; the failure is a domain error that `app.ts` renders into the
`ApiErrorBody` envelope. The handler knows no table names.

### Bad — `modules/pulls/routes.ts:260` (**debt**)

```ts
import { and, count, desc, eq, inArray, isNull, sum } from 'drizzle-orm';
import * as t from '../../db/schema.js';

// …inside the handler:
const files   = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
```

Three rings collapsed into one file. The HTTP layer now owns the query plan, so
the read model cannot be tested without a live Fastify request, and reusing
"load a PR with its files and commits" anywhere else means copying SQL.

Target shape: `PullsRepository.findDetail(prId)` returning a DTO, called by
`PullsService.getDetail`, called by the handler.

---

## 2. Reaching an external service

### Good — the four-step port

```ts
// 1. Port — vendor/shared/adapters.ts (BOTH vendored copies)
export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  // …
}

// 2. Adapter — adapters/github/octokit.ts, the ONLY file importing the SDK
import { Octokit } from 'octokit';
export class OctokitGitHubClient implements GitHubClient { /* … */ }

// 3. Wiring — platform/container.ts
async github(): Promise<GitHubClient> {
  if (this.overrides.github) return this.overrides.github;
  if (this._github) return this._github;
  const token = await this.secrets.get('GITHUB_TOKEN');
  if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
  this._github = new OctokitGitHubClient(token);
  return this._github;
}

// 4. Mock — adapters/mocks.ts
export class MockGitHubClient implements GitHubClient { /* … */ }
```

The service asks for `GitHubClient` and gets whichever implementation the
container decided on. That is the dependency inversion, and it is also why the
unit lane is hermetic and key-free.

### Bad

```ts
// modules/pulls/service.ts
import { Octokit } from 'octokit';

export class PullsService {
  private gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
}
```

Ring 3 now depends on a vendor SDK, reads the environment directly, and cannot
be tested without a token. Caught by `sdk-outside-adapters`.

---

## 3. What a repository returns

### Good

```ts
// repository.ts:65 — knows Drizzle, scopes by workspace
async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
  const [row] = await this.db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
  return row;
}

// helpers.ts — the edge mapping, camelCase → snake_case
export function toAgentDto(row: AgentRow): Agent { /* … */ }

// service.ts — speaks DTOs
async get(workspaceId: string, id: string): Promise<Agent | undefined> {
  const row = await this.repo.getById(workspaceId, id);
  return row ? toAgentDto(row) : undefined;
}
```

### Bad — returning the query builder

```ts
// repository.ts
getById(id: string) {
  return this.db.select().from(t.agents).where(eq(t.agents.id, id)); // not awaited
}

// service.ts — now holds a Drizzle query builder
const q = this.repo.getById(id).limit(1).offset(0);
```

The repository has become a thin, leaky wrapper: the service is coupled to
Drizzle's API, and swapping the query or the ORM means changing both. A
repository that leaks its ORM is worse than no repository at all — see
[references.md](references.md).

### Bad — leaking the database error

```ts
// service.ts
try {
  await this.repo.insert(input);
} catch (e: any) {
  if (e.code === '23505') throw new ValidationError('Name already taken');
}
```

`23505` is a Postgres unique-violation code. Ring 3 should not know it.
Translate at the repository edge and throw `ValidationError` from there.

---

## 4. Contract purity

### Good — `vendor/shared/contracts/findings.ts`

```ts
import { z } from 'zod';

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;
```

Schema and type share a name; the file imports nothing but `zod`. Every ring
can depend on it because it depends on nothing.

### Bad

```ts
import { z } from 'zod';
import type { LLMProvider } from '../adapters.js';   // ring 2 — outward
import { db } from '../../../db/client.js';          // ring 4 — much worse

export const Finding = z.object({ /* … */ });
```

The innermost ring now transitively pulls in Postgres. Caught by
`contracts-stay-pure`.

---

## 5. Injecting ports rather than the container

### Acceptable — the current convention

```ts
export class ReviewService {
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
  }
}
```

### Better — for new services

```ts
export class ReviewService {
  constructor(
    private repo: ReviewRepository,
    private agents: AgentsRepository,
    private llm: () => Promise<LLMProvider>,
  ) {}
}
```

The dependencies are now visible in the signature, the test does not need a
`Container`, and the service no longer imports the composition root — which is
exactly the cycle `no-circular` warns about for `repo-intel/service`.

---

## 6. Where a new piece of logic goes

| The code… | Ring | File |
|---|---|---|
| calls the GitHub REST API | 4 | `adapters/github/octokit.ts`, behind `GitHubClient` |
| decides which agents run on a PR | 3 | `modules/reviews/service.ts` |
| turns a diff into a prompt | 1 | `reviewer-core/src/prompt.ts` |
| drops findings that cite no real diff line | 1 | `reviewer-core/src/grounding.ts` |
| computes USD from tokens | 3 | `platform/price-book.ts` |
| turns `costUsd` into `cost_usd` | 4 (delivery) | `modules/reviews/helpers.ts` |
| stores a run row | 4 | `modules/reviews/repository/run.repo.ts` |
| defines what a `Finding` is | 1 | `vendor/shared/contracts/findings.ts` (both copies) |
