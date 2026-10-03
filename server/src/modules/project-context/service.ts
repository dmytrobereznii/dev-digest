import type {
  ContextAttachments,
  ProjectDocument,
  ProjectDocumentContent,
  ProjectDocumentList,
} from '@devdigest/shared';
import type { DocumentReader } from '../../adapters/docs/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type { ContextOwner } from './constants.js';
import {
  countAgentsByPath,
  documentType,
  planInjection,
  skillSpecPaths,
  type InjectionCandidate,
  type InjectionPlan,
} from './helpers.js';
import type { ProjectContextRepository } from './repository.js';

/** What a run injects: the plan (read/skipped) plus the document texts in prompt order. */
export type RunDocuments = {
  plan: InjectionPlan;
  documents: Array<{ path: string; content: string }>;
  /** Injected paths attached to each skill, by skill id (only non-empty entries). */
  skillPaths: Map<string, string[]>;
};

/**
 * Project Context service: lists documents from a repository's working tree,
 * serves their content, and manages agent / skill attachments. Takes the ports
 * it uses rather than the whole container.
 */
export class ProjectContextService {
  constructor(
    private readonly repo: ProjectContextRepository,
    private readonly reader: DocumentReader,
    private readonly tokenizer: Tokenizer,
    private readonly pattern: string,
    private readonly budget: number = Number.POSITIVE_INFINITY,
  ) {}

  /**
   * Documents for one run: the agent's attachments, then each enabled linked
   * skill's in link order, for the PR's repository only, read from its clone.
   * Throws if the lookup itself fails — the caller injects nothing then.
   */
  async resolveForRun(
    agentId: string,
    skillIds: string[],
    repo: { id: string; clonePath: string | null },
  ): Promise<RunDocuments> {
    const candidates: InjectionCandidate[] = [];
    for (const path of await this.repo.attachedPaths('agents', agentId, repo.id)) {
      candidates.push({ path, source: 'agent' });
    }
    for (const skillId of skillIds) {
      for (const path of await this.repo.attachedPaths('skills', skillId, repo.id)) {
        candidates.push({ path, source: skillId });
      }
    }
    if (candidates.length === 0) return { plan: { injected: [], skipped: [] }, documents: [], skillPaths: new Map() };

    const contents = new Map<string, string>();
    let listed: string[] = [];
    if (repo.clonePath) {
      listed = await this.listedPaths(repo.clonePath);
      const unique = [...new Set(candidates.map((c) => c.path))];
      for (const path of unique) {
        if (!listed.includes(path)) continue;
        try {
          contents.set(path, await this.reader.read(repo.clonePath, path));
        } catch {
          // unreadable → missing
        }
      }
    }
    const plan = planInjection(
      candidates,
      listed,
      (p) => (contents.has(p) ? this.tokenizer.count(contents.get(p)!) : null),
      this.budget,
    );
    return {
      plan,
      documents: plan.injected.map((d) => ({ path: d.path, content: contents.get(d.path)! })),
      skillPaths: new Map(
        skillIds
          .map((id) => [id, skillSpecPaths(plan, id)] as const)
          .filter(([, paths]) => paths.length > 0),
      ),
    };
  }

  /** Clone root of a repository; 404 for an unknown repo, null when not cloned. */
  private async root(workspaceId: string, repoId: string): Promise<string | null> {
    const clonePath = await this.repo.clonePath(workspaceId, repoId);
    if (clonePath === undefined) throw new NotFoundError('Repository not found');
    return clonePath;
  }

  /** Paths on disk, empty when the root cannot be read. */
  private async listedPaths(root: string): Promise<string[]> {
    try {
      return await this.reader.listPaths(root);
    } catch {
      return [];
    }
  }

  async list(workspaceId: string, repoId: string): Promise<ProjectDocumentList> {
    const root = await this.root(workspaceId, repoId);
    if (root === null) return { status: 'not_cloned', pattern: this.pattern, documents: [] };
    const paths = await this.listedPaths(root);
    const used = countAgentsByPath(await this.repo.usage(repoId));
    const documents: ProjectDocument[] = [];
    for (const path of paths) {
      let content: string;
      try {
        content = await this.reader.read(root, path);
      } catch {
        continue; // vanished or escaped the root between listing and reading
      }
      documents.push({
        path,
        type: documentType(path),
        tokens: this.tokenizer.count(content),
        used_by_agents: used.get(path) ?? 0,
      });
    }
    return { status: 'ok', pattern: this.pattern, documents };
  }

  async content(workspaceId: string, repoId: string, path: string): Promise<ProjectDocumentContent> {
    const root = await this.root(workspaceId, repoId);
    if (root === null || !(await this.listedPaths(root)).includes(path)) {
      throw new NotFoundError('Document not found');
    }
    let content: string;
    try {
      content = await this.reader.read(root, path);
    } catch {
      throw new NotFoundError('Document not found');
    }
    return { path, content, tokens: this.tokenizer.count(content) };
  }

  private async assertOwner(workspaceId: string, owner: ContextOwner, ownerId: string) {
    if (!(await this.repo.ownerExists(workspaceId, owner, ownerId))) {
      throw new NotFoundError(owner === 'agents' ? 'Agent not found' : 'Skill not found');
    }
  }

  async attachments(
    workspaceId: string,
    owner: ContextOwner,
    ownerId: string,
    repoId: string,
  ): Promise<ContextAttachments> {
    await this.root(workspaceId, repoId);
    await this.assertOwner(workspaceId, owner, ownerId);
    return { paths: await this.repo.attachedPaths(owner, ownerId, repoId) };
  }

  /** Idempotent; re-attaching moves the path to the end. Does not bump the owner's version. */
  async attach(
    workspaceId: string,
    owner: ContextOwner,
    ownerId: string,
    repoId: string,
    path: string,
  ): Promise<ContextAttachments> {
    const root = await this.root(workspaceId, repoId);
    await this.assertOwner(workspaceId, owner, ownerId);
    if (root === null || !(await this.listedPaths(root)).includes(path)) {
      throw new ValidationError('Path is not a listed Project Context document');
    }
    await this.repo.attach(owner, ownerId, repoId, path);
    return { paths: await this.repo.attachedPaths(owner, ownerId, repoId) };
  }

  /** Idempotent. */
  async detach(
    workspaceId: string,
    owner: ContextOwner,
    ownerId: string,
    repoId: string,
    path: string,
  ): Promise<ContextAttachments> {
    await this.root(workspaceId, repoId);
    await this.assertOwner(workspaceId, owner, ownerId);
    await this.repo.detach(owner, ownerId, repoId, path);
    return { paths: await this.repo.attachedPaths(owner, ownerId, repoId) };
  }
}
