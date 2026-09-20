import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';
import {
  DEFAULT_SKILL_DESCRIPTION,
  FALLBACK_SKILL_NAME,
  RESTORE_NOTE_PREFIX,
} from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * version-bump rule, and Markdown front-matter-free metadata derivation.
 * No I/O, so all of it unit-tests without a database.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/**
 * One row of a skill's history. Deliberately NOT a `vendor/shared` contract:
 * nothing outside the server needs the type, and adding one would mean editing
 * both vendored copies for no gain. The body is fetched on demand (the version
 * list would otherwise ship every historical body), so it is not listed here.
 */
export interface SkillVersionDto {
  version: number;
  note: string | null;
  created_at: string;
}

/** Map a persisted `skill_versions` row to the route-local version DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    version: row.version,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes the skill's BODY relative to the existing row — the
 * only change that bumps `version` and snapshots into `skill_versions`.
 *
 * Narrower than the agents module's `isConfigChange` on purpose, and separate
 * from it rather than reused: an agent's config is provider + model + prompt +
 * flags, while a skill's only config IS its body (D8 / §3.1). Renaming a skill,
 * re-typing it, rewording its description or flipping `enabled` are metadata
 * edits and must leave history untouched.
 */
export function isBodyChange(
  existing: Pick<SkillRow, 'body'>,
  patch: { body?: string },
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** The note `SkillsService.restore` records on the new version it writes (D8). */
export function restoreNote(version: number): string {
  return `${RESTORE_NOTE_PREFIX}${version}`;
}

/** Metadata derived from a skill body when the client left it blank (§3.1). */
export interface ParsedSkillMarkdown {
  name: string;
  description: string;
}

/**
 * Derive a skill's `name` and `description` from its Markdown body:
 * the first `# H1` becomes the name, and the first paragraph beneath that
 * heading becomes the description.
 *
 * A body with no `# H1` falls back to `FALLBACK_SKILL_NAME` and an empty
 * description — the create form's name field is optional (D1's single editor),
 * so "no heading at all" is a shape a user can actually submit and must not
 * produce an empty name.
 */
export function parseSkillMarkdown(body: string): ParsedSkillMarkdown {
  const lines = body.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (headingIndex === -1) {
    return { name: FALLBACK_SKILL_NAME, description: DEFAULT_SKILL_DESCRIPTION };
  }

  const name = lines[headingIndex]!.replace(/^#\s+/, '').trim();

  // The first paragraph under the heading: skip blank lines, then take
  // consecutive non-blank lines up to the next blank line or the next heading.
  const rest = lines.slice(headingIndex + 1);
  const start = rest.findIndex((line) => line.trim() !== '');
  if (start === -1) return { name, description: DEFAULT_SKILL_DESCRIPTION };

  const paragraph: string[] = [];
  for (const line of rest.slice(start)) {
    if (line.trim() === '' || line.startsWith('#')) break;
    paragraph.push(line.trim());
  }

  return { name, description: paragraph.join(' ') || DEFAULT_SKILL_DESCRIPTION };
}
