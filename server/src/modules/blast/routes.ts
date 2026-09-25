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
      return service.get(workspaceId, req.params.id);
    },
  );
}
