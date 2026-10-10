import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentEvalOverview,
  ApiErrorBody,
  EvalCase,
  EvalDashboard,
  EvalRunDetail,
  EvalRunSummary,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound, OkResponse } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Eval module (L06).
 *   POST   /findings/:id/eval-case → 201 new case, 200 the existing one
 *   GET    /agents/:id/evals       → cases (+ runs, trend) of one agent
 *   DELETE /eval-cases/:id         → delete a case (refused while a run is running)
 */
const Conflict = { 409: ApiErrorBody } as const;

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const container = app.container;
  const service = new EvalService({
    repo: container.evalRepo,
    agents: container.agentsRepo,
    reviews: container.reviewRepo,
    llm: container.llm.bind(container),
  });

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        response: { 200: EvalCase, 201: EvalCase, ...ApiErrors, ...NotFound, ...Conflict },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { case: evalCase, created } = await service.createCase(workspaceId, req.params.id);
      reply.status(created ? 201 : 200);
      return evalCase;
    },
  );

  app.get(
    '/agents/:id/evals',
    {
      schema: { params: IdParams, response: { 200: AgentEvalOverview, ...ApiErrors, ...NotFound } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.overview(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: IdParams,
        response: { 201: EvalRunSummary, ...ApiErrors, ...NotFound, ...Conflict },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startRun(workspaceId, req.params.id);
      reply.status(201);
      return run;
    },
  );

  app.get(
    '/eval-runs/:id',
    {
      schema: { params: IdParams, response: { 200: EvalRunDetail, ...ApiErrors, ...NotFound } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalDashboard, ...ApiErrors } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.dashboard(workspaceId);
    },
  );

  app.delete(
    '/eval-cases/:id',
    {
      schema: { params: IdParams, response: { 200: OkResponse, ...ApiErrors, ...NotFound, ...Conflict } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true };
    },
  );
}
