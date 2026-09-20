/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * Job-handler registration lives here: this plugin runs once at app boot and
 * calls `RepoIntelService.registerIndexJobHandlers()` so INDEX/REFRESH jobs
 * enqueued by `repos/service.ts` (after clone / on refresh) have a handler
 * to run against. Mirrors the `RepoService.registerCloneJobHandler()` shape.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams } from '../_shared/schemas.js';
import { RepoIntelService } from './service.js';
import { RESYNC_JOB_KIND } from './constants.js';
import type { IndexState } from './types.js';

/**
 * Response shape of `GET /repos/:id/index-state`. `IndexState` is a TypeScript
 * interface in `./types.ts` (the facade's Tier-1 contract) with no Zod twin, so
 * this mirrors it — the `z.ZodType<IndexState>` annotation is what makes the
 * mirror fail type-check if the interface changes underneath it.
 *
 * `updatedAt` is a `Date` in the interface and serializes to an ISO string on
 * the wire; `z.date()` accepts the Date the handler returns and JSON.stringify
 * does the conversion.
 */
const IndexStateResponse: z.ZodType<IndexState> = z.object({
  repoId: z.string(),
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  filesIndexed: z.number().int(),
  filesSkipped: z.number().int(),
  durationMs: z.number(),
  reason: z.string().optional(),
  lastIndexedSha: z.string(),
  indexerVersion: z.number().int(),
  updatedAt: z.date(),
  degraded: z.boolean().optional(),
  degradedReason: z
    .enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data'])
    .optional(),
});

/** 202 body — a job id, or the degraded acknowledgement when enqueue failed. */
const ResyncResponse = z.union([
  z.object({ status: z.literal('accepted'), jobId: z.string() }),
  z.object({
    status: z.literal('accepted'),
    degraded: z.literal(true),
    reason: z.literal('no_handler'),
  }),
]);

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Register the INDEX/REFRESH handlers exactly once at module load. Using a
  // local service here (instead of `container.repoIntel`) is fine — the
  // JobRunner stores the handler closure, not the service instance, and the
  // lazy `container.repoIntel` getter constructs its own service for read
  // calls. Both share the same DB, so behaviour is identical.
  const service = new RepoIntelService(container);
  service.registerIndexJobHandlers();

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams, response: { 200: IndexStateResponse, ...ApiErrors } } },
    async (req): Promise<IndexState> => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic (consistent with blast routes).
      await getContext(container, req);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams, response: { 202: ResyncResponse, ...ApiErrors } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // 202 even when enqueue fails (no handler / DB hiccup) so the UI can
      // still poll /index-state without an inline error path. The actual
      // outcome shows up in `repo_index_state` once the worker runs.
      let jobId: string | null = null;
      try {
        const job = await container.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, {
          repoId: req.params.id,
        });
        jobId = job.id;
      } catch {
        // swallow — degraded path
      }
      reply.code(202);
      return jobId
        ? ({ status: 'accepted', jobId } as const)
        : ({ status: 'accepted', degraded: true, reason: 'no_handler' } as const);
    },
  );
}
