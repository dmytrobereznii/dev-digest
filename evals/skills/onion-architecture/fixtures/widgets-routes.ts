// server/src/modules/widgets/routes.ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { widgets } from "../../db/schema.js";
import { getContext } from "../../platform/context.js";
import { NotFoundError } from "../../platform/errors.js";
import { WidgetService } from "./service.js";

const IdParams = z.object({ id: z.string().uuid() });
const CreateBody = z.object({ name: z.string().min(1), repo_id: z.string().uuid() });

export async function widgetRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/widgets", async (req) => {
    const { container } = getContext(req);
    const rows = await container.db
      .select()
      .from(widgets)
      .where(eq(widgets.workspaceId, container.workspaceId))
      .orderBy(desc(widgets.createdAt))
      .limit(50);
    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      repo_id: w.repoId,
      created_at: w.createdAt.toISOString(),
    }));
  });

  r.get("/widgets/:id", { schema: { params: IdParams } }, async (req, reply) => {
    const { container } = getContext(req);
    const svc = new WidgetService(container);
    const widget = await svc.get(req.params.id);
    if (!widget) {
      return reply.code(404).send({ error: { code: "not_found", message: "widget not found" } });
    }
    return widget;
  });

  r.post("/widgets", { schema: { body: CreateBody } }, async (req) => {
    const { container } = getContext(req);
    const svc = new WidgetService(container);
    return svc.create(req.body.name, req.body.repo_id);
  });
}
