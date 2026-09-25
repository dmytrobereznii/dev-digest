/**
 * Smart Diff — path classification (spec 08 §4, D1/D2). PURE and path-only:
 * no file reads, no diff content. `normalizePath` first, then first
 * matching role in `ROLE_RULES` (D2's match order) wins; `core` is the
 * fallback when nothing matches.
 */

import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES } from './constants.js';

/** `\` → `/`, then strip one leading `./`. Rule patterns assume a POSIX,
 * repo-relative path. */
export function normalizePath(path: string): string {
  const posix = path.replace(/\\/g, '/');
  return posix.startsWith('./') ? posix.slice(2) : posix;
}

/** Classify a repo-relative file path into a Smart Diff role. First matching
 * role in `ROLE_RULES` wins; unmatched paths are `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = normalizePath(path);
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.role;
    }
  }
  return 'core';
}
