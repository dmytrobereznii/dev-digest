import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ApiErrorBody, PrBriefRecord, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';
import { BriefService } from './service.js';
import { briefLogFields } from './helpers.js';
import { GENERATE_RATE_LIMIT } from './constants.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief → the stored brief (`brief: null` before any), plus
 *                           whether a generation is in flight. Never calls a model.
 *   POST /pulls/:id/brief → generate and store. 422 `brief_no_files`, 409
 *                           `brief_in_progress`, 502 `brief_failed`; a failure
 *                           keeps the previous brief.
 *
 * No container getter: no other module calls this service.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: {
        params: IdParams,
        response: {
          200: PrBriefRecord,
          409: ApiErrorBody,
          502: ApiErrorBody,
          ...ApiErrors,
          ...NotFound,
        },
      },
      // Each call is a paid model call.
      config: { rateLimit: GENERATE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const record = await service.generate(workspaceId, req.params.id);
      req.log.info(briefLogFields(record), 'brief generated');
      return record;
    },
  );
}
