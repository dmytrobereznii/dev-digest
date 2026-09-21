import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCandidate, ConventionStatus, Skill, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — the extractor surface that writes into the Skills Lab.
 *   GET  /repos/:id/conventions          → { scan, candidates }
 *   POST /repos/:id/conventions/extract  → the same shape, 200 (synchronous, D7)
 *   PUT  /conventions/:id                → one candidate's triage state
 *   PUT  /repos/:id/conventions/status   → Accept all / Deselect all
 *   POST /repos/:id/conventions/skill    → the merged skill, 201 (D8)
 *
 * Every route is repo- or candidate-scoped and every one resolves its row inside
 * the caller's workspace, so a 404 covers "not yours" and "not there" alike.
 */

/**
 * One scan, route-LOCAL like `SkillVersion` in `modules/skills/routes.ts`.
 * Nothing outside the server needs the type, and adding it to `vendor/shared`
 * would mean editing both vendored copies and creating new drift for no gain.
 */
const Scan = z.object({
  id: z.string(),
  sample_count: z.number().int(),
  model: z.string(),
  created_at: z.string(),
});

/** `scan: null` is the never-scanned signal the empty state reads (D4). */
const ConventionsPage = z.object({
  scan: Scan.nullable(),
  candidates: z.array(ConventionCandidate),
});

/**
 * `status` and nothing else. The rule, the evidence and the confidence are the
 * gate's output, not user input: a hand-edited rule would carry a snippet and a
 * confidence that no longer describe it. The modal's body editor is the design's
 * only editing surface.
 */
const UpdateConventionBody = z.object({ status: ConventionStatus });

/**
 * The toolbar's two states. `rejected` is deliberately NOT accepted here: reject
 * is terminal and per-card (D2), so there is no bulk reject to reach for, and
 * "Deselect all" must not be one keystroke away from throwing the list away.
 */
const BulkStatusBody = z.object({ status: z.enum(['pending', 'accepted']) });

/**
 * The edited draft (D8). No `source`: the server writes `'extracted'`, and a
 * client that could name its own provenance could claim `'manual'` for a body
 * full of verbatim repo text and skip the trust rule in `run-executor`.
 */
const CreateSkillFromConventionsBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.default('convention'),
  enabled: z.boolean().default(true),
  body: z.string().min(1),
  /** The candidates the body was merged from — checked against this repo. */
  convention_ids: z.array(z.string().uuid()).min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionsPage, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const page = await service.list(workspaceId, req.params.id);
      if (!page) throw new NotFoundError('Repository not found');
      return page;
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams, response: { 200: ConventionsPage, ...ApiErrors, ...NotFound } },
      // One model call and a pass over the clone. Rate-limited like the review
      // run route: the cost of a held-down button is real money, not just load.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const page = await service.extract(workspaceId, req.params.id, req.log);
      if (!page) throw new NotFoundError('Repository not found');
      return page;
    },
  );

  app.put(
    '/conventions/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateConventionBody,
        response: { 200: ConventionCandidate, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.setStatus(workspaceId, req.params.id, req.body.status);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.put(
    '/repos/:id/conventions/status',
    {
      schema: {
        params: IdParams,
        body: BulkStatusBody,
        response: { 200: z.array(ConventionCandidate), ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.setStatusAll(workspaceId, req.params.id, req.body.status);
      if (!candidates) throw new NotFoundError('Repository not found');
      return candidates;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    {
      schema: {
        params: IdParams,
        body: CreateSkillFromConventionsBody,
        response: { 201: Skill, ...ApiErrors, ...NotFound },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.createSkill(workspaceId, req.params.id, {
        name: body.name,
        type: body.type,
        enabled: body.enabled,
        body: body.body,
        convention_ids: body.convention_ids,
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
      if (!skill) throw new NotFoundError('Repository not found');
      reply.status(201);
      return skill;
    },
  );
}
