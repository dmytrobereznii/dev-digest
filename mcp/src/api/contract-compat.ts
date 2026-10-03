/**
 * Type-only compile-time check (D3/T17): every slim parser in `./schemas.ts`
 * is checked against the server's SHARED contract it parses a response for.
 * `Server extends z.input<Slim>` means the slim schema is exactly as
 * permissive as the server's field — no narrower, no `.optional()` a
 * required server field doesn't have — so a contract change (a field
 * dropped, renamed, or its nullability tightened/loosened) fails
 * `npm run typecheck` here rather than drifting silently at runtime.
 *
 * `@devdigest/shared` resolves to `../server/src/vendor/shared` (tsconfig
 * `paths`), so this is a compile-time-only cross-package read — nothing here
 * runs, and nothing imports this file, so `tsx` never loads it (D3).
 */
import type { z } from 'zod';
import type {
  Agent,
  Repo,
  PrMeta,
  PrDetail,
  RunSummary,
  ActiveRun,
  ReviewRunResponse,
  ReviewRecord,
  ConventionCandidate,
  BlastRadiusResponse,
  ApiErrorBody as ServerApiErrorBody,
} from '@devdigest/shared';
import {
  ApiAgent,
  ApiRepo,
  ApiPr,
  ApiPrDetail,
  ApiRunStart,
  ApiActiveRun,
  ApiRun,
  ApiReview,
  ApiConventionCandidate,
  ApiBlast,
  ApiErrorBody,
} from './schemas.js';

type Assert<T extends true> = T;

export type _Agent = Assert<Agent extends z.input<typeof ApiAgent> ? true : false>;
export type _Repo = Assert<Repo extends z.input<typeof ApiRepo> ? true : false>;
export type _Pr = Assert<PrMeta extends z.input<typeof ApiPr> ? true : false>;
export type _PrDetail = Assert<PrDetail extends z.input<typeof ApiPrDetail> ? true : false>;
export type _RunStart = Assert<ReviewRunResponse extends z.input<typeof ApiRunStart> ? true : false>;
export type _ActiveRun = Assert<ActiveRun extends z.input<typeof ApiActiveRun> ? true : false>;
export type _Run = Assert<RunSummary extends z.input<typeof ApiRun> ? true : false>;
export type _Review = Assert<ReviewRecord extends z.input<typeof ApiReview> ? true : false>;
export type _ConventionCandidate = Assert<
  ConventionCandidate extends z.input<typeof ApiConventionCandidate> ? true : false
>;
export type _Blast = Assert<BlastRadiusResponse extends z.input<typeof ApiBlast> ? true : false>;
export type _ErrorBody = Assert<ServerApiErrorBody extends z.input<typeof ApiErrorBody> ? true : false>;
