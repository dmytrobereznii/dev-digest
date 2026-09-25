import type { BlastResult } from '../repo-intel/types.js';

/**
 * blast module constants (§5).
 *
 * The facade's shape for "never called" — 0 changed files short-circuits
 * before `repoIntel.getBlastRadius` runs (D4 rule 1).
 */
export const EMPTY_RESULT: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
