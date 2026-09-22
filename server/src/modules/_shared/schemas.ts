import { z } from 'zod';
import { ApiErrorBody } from '@devdigest/shared';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/**
 * The error envelope `app.ts`'s error handler builds, declared as a response
 * schema so a route's contract documents how it FAILS as well as how it
 * succeeds. Spread into `response` alongside the success code:
 *
 *     response: { 200: z.array(Agent), ...ApiErrors, ...NotFound }
 *
 * Codes not listed here fall through to Fastify's default serializer, which is
 * deliberate: `@fastify/rate-limit`'s 429 and the 503 from `/health/ready` do
 * not go through every route and are not worth restating on each one.
 */
export const ApiErrors = {
  /** Request validation (zod type provider), or a service-level `.parse()`. */
  422: ApiErrorBody,
  /** The catch-all branch of the error handler. */
  500: ApiErrorBody,
} as const;

/** For routes that resolve a row by id and throw `NotFoundError`. */
export const NotFound = { 404: ApiErrorBody } as const;

/** The `{ ok }` acknowledgement several mutating routes return. */
export const OkResponse = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof OkResponse>;
