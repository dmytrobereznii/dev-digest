import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module (§5, D3/D4/D14).
 *   GET /pulls/:id/smart-diff → the Files-changed tab's role-grouped view of
 *                                a PR's files, with the latest review's
 *                                findings folded in. No LLM call, works with
 *                                no review yet (`review_id: null`).
 *
 * No container getter: no other module calls this service.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    {
      schema: {
        params: IdParams,
        response: { 200: SmartDiffResponse, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
