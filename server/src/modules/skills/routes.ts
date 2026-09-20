import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Skill, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound, OkResponse } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills module — the Skills Lab's CRUD surface.
 *   GET    /skills                               → list (workspace-scoped)
 *   GET    /skills/:id                           → one skill
 *   POST   /skills                               → create (the ONE editor, D1)
 *   PUT    /skills/:id                           → partial patch + optional note
 *   DELETE /skills/:id                           → delete (agent links cascade)
 *   GET    /skills/:id/versions                  → body history (newest first)
 *   POST   /skills/:id/versions/:version/restore → restore as a NEW version
 *   GET    /skills/:id/agents                    → agents using this skill
 *
 * That is the whole surface: there is NO `/skills/import` (D1) — a skill is
 * typed or pasted into the one editor, and provenance is a checkbox.
 */

/** `/skills/:id/versions/:version/…` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  /** Optional — the service derives it from the body's first `# H1` (§3.1). */
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.default('custom'),
  body: z.string().min(1),
  /**
   * The create form's Enabled toggle. Honoured for a first-party skill;
   * IGNORED (clamped to false) when `source_is_external` is true, so ticking
   * the provenance box always wins. Absent → true.
   */
  enabled: z.boolean().optional(),
  /**
   * The provenance checkbox (D2). `source` is never accepted from the client:
   * this boolean is the only way to influence it, and it picks between two
   * server-defined outcomes (`manual`+enabled / `imported_url`+disabled).
   */
  source_is_external: z.boolean().default(false),
});

/**
 * A partial patch. Neither `source` nor `source_is_external` appears here —
 * provenance is set once, at creation (D2); a skill does not become trusted
 * because someone edited it. `note` is recorded only when the body changed.
 */
const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  note: z.string().optional(),
});

/**
 * One row of a skill's history — route-local, not a `vendor/shared` contract:
 * nothing outside the server needs it, and adding one would mean editing both
 * vendored copies and creating new drift for no gain. The body is fetched on
 * demand (`GET /skills/:id`), not listed.
 */
const SkillVersion = z.object({
  version: z.number().int(),
  note: z.string().nullable(),
  created_at: z.string(),
});

/** Likewise route-local: the agents using a skill, for `N agents` + delete confirm. */
const SkillAgent = z.object({ id: z.string(), name: z.string() });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get(
    '/skills',
    { schema: { response: { 200: z.array(Skill), ...ApiErrors } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId);
    },
  );

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Skill, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.post(
    '/skills',
    { schema: { body: CreateSkillBody, response: { 201: Skill, ...ApiErrors } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.create(workspaceId, {
        body: body.body,
        type: body.type,
        source_is_external: body.source_is_external,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      });
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateSkillBody,
        response: { 200: Skill, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: OkResponse, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Skill not found');
      return { ok: true };
    },
  );

  app.get(
    '/skills/:id/versions',
    {
      schema: {
        params: IdParams,
        response: { 200: z.array(SkillVersion), ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, response: { 200: Skill, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get(
    '/skills/:id/agents',
    {
      schema: {
        params: IdParams,
        response: { 200: z.array(SkillAgent), ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agents = await service.agentsUsing(workspaceId, req.params.id);
      if (!agents) throw new NotFoundError('Skill not found');
      return agents;
    },
  );
}
