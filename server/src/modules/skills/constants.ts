/** Constants for the skills module. */

/** Version recorded for a newly-created skill (its first `skill_versions` row). */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill type when the create body doesn't name one. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/** Default description when none is supplied and the body has no first paragraph. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Name used when a body carries no `# H1` to derive one from (§3.1). */
export const FALLBACK_SKILL_NAME = 'Untitled skill';

/**
 * Prefix of the note written by `SkillsService.restore` (D8). Restoring appends
 * a NEW version rather than rewinding history, and the note says where it came
 * from — see `restoreNote` in ./helpers.ts.
 */
export const RESTORE_NOTE_PREFIX = 'Restored from v';
