// server/src/modules/labels/routes.ts
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getContext } from "../../platform/context.js";
import { Label } from "../../vendor/shared/contracts/label.js";

const IdParams = z.object({ id: z.string().uuid() });

export async function labelRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/labels/:id", { schema: { params: IdParams, response: { 200: Label } } }, async (req) => {
    const { container } = getContext(req);
    return container.labels.get(req.params.id);
  });
}

// server/src/modules/labels/service.ts
import { NotFoundError } from "../../platform/errors.js";
import type { Label } from "../../vendor/shared/contracts/label.js";
import type { LabelRepository } from "./repository.js";
import { toLabelDto } from "./helpers.js";

export class LabelService {
  constructor(private readonly repo: LabelRepository) {}

  async get(id: string): Promise<Label> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("label", id);
    return toLabelDto(row);
  }
}

// server/src/modules/labels/repository.ts
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { labels } from "../../db/schema.js";
import type { LabelRow } from "../../db/rows.js";

export class LabelRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<LabelRow | null> {
    const [row] = await this.db.select().from(labels).where(eq(labels.id, id)).limit(1);
    return row ?? null;
  }
}

// server/src/platform/container.ts (excerpt)
import { LabelRepository } from "../modules/labels/repository.js";
import { LabelService } from "../modules/labels/service.js";

export function buildContainer(db: Db): Container {
  let labels: LabelService | undefined;
  return {
    db,
    get labels() {
      return (labels ??= new LabelService(new LabelRepository(db)));
    },
  };
}
