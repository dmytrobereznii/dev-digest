import type { Container } from '../../platform/container.js';
import type { Skill, SkillType } from '@devdigest/shared';
import { SkillsRepository, type AgentUsingSkill } from './repository.js';
import {
  parseSkillMarkdown,
  restoreNote,
  toSkillDto,
  toSkillVersionDto,
  type SkillVersionDto,
} from './helpers.js';
import { DEFAULT_SKILL_TYPE } from './constants.js';

/**
 * Skills service. Business logic for the Skills Lab (list + per-skill editor).
 *
 * A skill is a reusable block of Markdown an agent appends to its prompt — text
 * and nothing else. Body changes are versioned via `skill_versions`
 * (repository); everything else here is policy: how provenance is decided, how
 * blank metadata is derived from the body, and what "restore" means.
 */

// Re-exported for symmetry with the agents module; implementation in ./helpers.
export { toSkillDto } from './helpers.js';
export type { SkillVersionDto } from './helpers.js';

export interface CreateSkillInput {
  /** Optional — derived from the body's first `# H1` when blank (§3.1). */
  name?: string;
  description?: string;
  type?: SkillType;
  body: string;
  /**
   * The "This came from a third party" checkbox (D2). NOT a `source`: a client
   * that could name its own source could claim `'manual'` for a third-party
   * body and walk straight past the trust rule. A boolean can only choose
   * between two server-defined outcomes.
   */
  source_is_external: boolean;
  /** The create form's Enabled toggle. Clamped to false when the skill is
      third-party; absent → true. */
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** One-line note recorded on the snapshot — only used when the body changed. */
  note?: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions / agent links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Create a skill from the one editor (D1). Provenance is decided HERE, from
   * the checkbox, and is set once: a third-party body is stored as
   * `imported_url` and arrives DISABLED, so it has to be vetted before any
   * agent can use it (D2). A skill does not become trusted because someone
   * edited it, which is why `update` accepts neither field.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const derived = parseSkillMarkdown(input.body);
    const row = await this.repo.insert({
      workspaceId,
      name: input.name ?? derived.name,
      description: input.description ?? derived.description,
      type: input.type ?? DEFAULT_SKILL_TYPE,
      source: input.source_is_external ? 'imported_url' : 'manual',
      body: input.body,
      // A third-party skill is ALWAYS created disabled — the clamp is what
      // keeps vetting from being decorative (D2), and it is deliberately not
      // overridable by the client. Otherwise the author's own Enabled toggle
      // is honoured; ignoring it silently created skills the user had just
      // switched off.
      enabled: input.source_is_external ? false : (input.enabled ?? true),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      patch.note ?? null,
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to a
   * 404) so snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore an older body as the CURRENT one.
   *
   * This lives in the service, not the repository: it is two data operations
   * composed by a rule — history is append-only, so restoring writes a NEW
   * version rather than rewinding to the old one. The new snapshot is noted
   * `Restored from vN` (D8).
   *
   * Returns undefined when the skill isn't in this workspace or that version
   * was never recorded (route → 404). Restoring a version whose body is already
   * current is a no-op by construction: `isBodyChange` sees no change, so no
   * version is minted.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(
      workspaceId,
      id,
      { body: snapshot.body },
      restoreNote(version),
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * The agents a skill is linked to. Workspace-scoped on the skill: returns
   * undefined when the skill isn't in this workspace (route → 404).
   */
  async agentsUsing(workspaceId: string, id: string): Promise<AgentUsingSkill[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.agentsUsing(id);
  }
}
