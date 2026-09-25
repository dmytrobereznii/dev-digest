/**
 * Type-only compile-time check (SHOULD-FIX/architecture-reviewer), mirroring
 * `../api/contract-compat.ts`: each tool's hand-written `Args` interface —
 * the type its handler is annotated with, after `toInputSchema` (params.ts)
 * erases the type the SDK sees from `INPUT_SHAPE` — is asserted EQUAL to
 * `z.infer` of its own `INPUT_SHAPE`, in both directions, so a field added,
 * removed, renamed or re-optionalised on one side and not the other fails
 * `npm run typecheck` here instead of drifting silently.
 *
 * Unlike `params.ts`'s `toInputSchema` (which hits TS2589 comparing a raw
 * zod SCHEMA INSTANCE against the SDK's own compatibility union), this file
 * only ever infers over the raw `INPUT_SHAPE` TYPE via `z.ZodObject<typeof
 * Shape>` — no SDK types involved — so the direct, fully inlined equality
 * check below compiles as written; no narrower form was needed.
 *
 * `list_agents` has no `INPUT_SHAPE` (no input schema, §6.2) so it has no
 * entry here.
 *
 * Like `contract-compat.ts`, nothing imports this file, so `tsx` never loads
 * it at runtime — TYPE-ONLY, same as its sibling.
 */
import type { z } from 'zod';
import type { Args as GetBlastRadiusArgs, INPUT_SHAPE as GetBlastRadiusShape } from './get-blast-radius.js';
import type { Args as GetConventionsArgs, INPUT_SHAPE as GetConventionsShape } from './get-conventions.js';
import type { Args as GetFindingsArgs, INPUT_SHAPE as GetFindingsShape } from './get-findings.js';
import type { Args as RunAgentOnPrArgs, INPUT_SHAPE as RunAgentOnPrShape } from './run-agent-on-pr.js';

type Assert<T extends true> = T;
type Equal<A, B> = A extends B ? (B extends A ? true : false) : false;

export type _RunAgentOnPr = Assert<Equal<RunAgentOnPrArgs, z.infer<z.ZodObject<typeof RunAgentOnPrShape>>>>;
export type _GetFindings = Assert<Equal<GetFindingsArgs, z.infer<z.ZodObject<typeof GetFindingsShape>>>>;
export type _GetConventions = Assert<Equal<GetConventionsArgs, z.infer<z.ZodObject<typeof GetConventionsShape>>>>;
export type _GetBlastRadius = Assert<Equal<GetBlastRadiusArgs, z.infer<z.ZodObject<typeof GetBlastRadiusShape>>>>;
