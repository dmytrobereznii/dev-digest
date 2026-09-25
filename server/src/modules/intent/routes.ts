import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ApiErrorBody, DeriveIntentRequest, PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';

/**
 * intent module (L03 D1/D5-D13/§5.2).
 *   GET  /pulls/:id/intent  → the cached PrIntentRecord (`{ intent: null }`
 *                             before any derivation). Never calls the LLM (D2).
 *   POST /pulls/:id/intent  → derive (reusing the cached row unless `force`)
 *                             and persist. `502 intent_failed` on a classifier
 *                             failure — the previous row (if any) is kept (D9).
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.intent.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: {
        params: IdParams,
        body: DeriveIntentRequest,
        response: { 200: PrIntentRecord, 502: ApiErrorBody, ...ApiErrors, ...NotFound },
      },
      // Tight per-route limit: each call can trigger a paid LLM call, same
      // reasoning as POST /pulls/:id/review.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.intent.derive(workspaceId, req.params.id, req.body);
    },
  );
}
