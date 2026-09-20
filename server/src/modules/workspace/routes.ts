import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { ApiErrors } from '../_shared/schemas.js';

/**
 * The workspace overview. A module-local shape rather than a `vendor/shared`
 * contract: it is an aggregate assembled here for one screen, not a row or a
 * DTO any other package builds.
 */
const WorkspaceOverview = z.object({
  workspaceId: z.string(),
  cloneDir: z.string(),
  repos: z.array(
    z.object({
      id: z.string(),
      full_name: z.string(),
      clone_path: z.string().nullable(),
      last_polled_at: z.string().nullable(),
      cloned: z.boolean(),
    }),
  ),
});

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/workspace',
    { schema: { response: { 200: WorkspaceOverview, ...ApiErrors } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const repos = await container.db
        .select()
        .from(t.repos)
        .where(eq(t.repos.workspaceId, workspaceId));
      return {
        workspaceId,
        cloneDir: container.config.cloneDir,
        repos: repos.map((r) => ({
          id: r.id,
          full_name: r.fullName,
          clone_path: r.clonePath,
          last_polled_at: r.lastPolledAt?.toISOString() ?? null,
          cloned: Boolean(r.clonePath),
        })),
      };
    },
  );
}
