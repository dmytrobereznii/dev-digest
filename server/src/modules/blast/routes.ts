import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module (spec 10 D1/D6).
 *   GET /pulls/:id/blast → the Overview tab's Blast radius card: the PR's
 *                           changed symbols, their callers, and the endpoints
 *                           / crons in those callers' files — all read from
 *                           the repo-intel index already built. No model
 *                           call, no fresh analysis; a pure read (the MCP
 *                           tool marks it `readOnlyHint`).
 *
 * No container getter: no other module calls this service.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    {
      schema: {
        params: IdParams,
        response: { 200: BlastRadiusResponse, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const blast = await service.get(workspaceId, req.params.id);
      // Evidence the map is a read of the persisted index — no parse, no
      // import-graph rebuild, no model call happens on this path.
      req.log.info(
        {
          prId: req.params.id,
          source: blast.index_sha ? 'repo-intel persisted index' : 'no index',
          indexSha: blast.index_sha,
          status: blast.status,
          degradedReason: blast.degraded_reason,
          stats: blast.stats,
        },
        blast.index_sha
          ? 'blast radius read from the pre-built index'
          : 'blast radius served without an index (degraded)',
      );
      return blast;
    },
  );
}
