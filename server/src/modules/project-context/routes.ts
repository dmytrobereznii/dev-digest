import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContextAttachments,
  ProjectDocumentContent,
  ProjectDocumentList,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ApiErrors, IdParams, NotFound } from '../_shared/schemas.js';
import { CONTEXT_OWNERS } from './constants.js';

/**
 * Project Context routes.
 *   GET    /repos/:id/context                 → documents found in the clone
 *   GET    /repos/:id/context/content?path=   → one document's text
 *   GET    /:owner/:id/context?repo_id=       → attachments (owner: agents | skills)
 *   POST   /:owner/:id/context                → attach { repo_id, path }
 *   DELETE /:owner/:id/context?repo_id=&path= → detach
 */
const OwnerParams = z.object({ owner: z.enum(CONTEXT_OWNERS), id: z.string().uuid() });
const RepoQuery = z.object({ repo_id: z.string().uuid() });
const ContentQuery = z.object({ path: z.string().min(1) });
const AttachBody = z.object({ repo_id: z.string().uuid(), path: z.string().min(1) });
const DetachQuery = z.object({ repo_id: z.string().uuid(), path: z.string().min(1) });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.projectContext;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectDocumentList, ...ApiErrors, ...NotFound } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/content',
    {
      schema: {
        params: IdParams,
        querystring: ContentQuery,
        response: { 200: ProjectDocumentContent, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.content(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/:owner/:id/context',
    {
      schema: {
        params: OwnerParams,
        querystring: RepoQuery,
        response: { 200: ContextAttachments, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { owner, id } = req.params;
      return service.attachments(workspaceId, owner, id, req.query.repo_id);
    },
  );

  app.post(
    '/:owner/:id/context',
    {
      schema: {
        params: OwnerParams,
        body: AttachBody,
        response: { 200: ContextAttachments, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { owner, id } = req.params;
      return service.attach(workspaceId, owner, id, req.body.repo_id, req.body.path);
    },
  );

  app.delete(
    '/:owner/:id/context',
    {
      schema: {
        params: OwnerParams,
        querystring: DetachQuery,
        response: { 200: ContextAttachments, ...ApiErrors, ...NotFound },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { owner, id } = req.params;
      return service.detach(workspaceId, owner, id, req.query.repo_id, req.query.path);
    },
  );
}
