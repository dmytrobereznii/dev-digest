import { z } from 'zod';

/**
 * Project Context — repository documents (specs, docs, insights) that can be
 * attached to an agent or a skill and injected into a review prompt.
 */

export const ProjectDocumentType = z.enum(['specs', 'docs', 'insights', 'other']);
export type ProjectDocumentType = z.infer<typeof ProjectDocumentType>;

/** One document found in a repository's clone. */
export const ProjectDocument = z.object({
  /** Repo-relative path. */
  path: z.string(),
  type: ProjectDocumentType,
  tokens: z.number().int(),
  /** Distinct agents that use it, directly or through an enabled linked skill. */
  used_by_agents: z.number().int(),
});
export type ProjectDocument = z.infer<typeof ProjectDocument>;

/** `GET /repos/:id/context` — `not_cloned` when the repository has no clone. */
export const ProjectDocumentList = z.object({
  status: z.enum(['ok', 'not_cloned']),
  /** The configured search pattern, so an empty state can name it. */
  pattern: z.string(),
  documents: z.array(ProjectDocument),
});
export type ProjectDocumentList = z.infer<typeof ProjectDocumentList>;

/** `GET /repos/:id/context/content?path=` */
export const ProjectDocumentContent = z.object({
  path: z.string(),
  content: z.string(),
  tokens: z.number().int(),
});
export type ProjectDocumentContent = z.infer<typeof ProjectDocumentContent>;

/** Attachments of an owner (agent or skill) for one repository, in attach order. */
export const ContextAttachments = z.object({
  paths: z.array(z.string()),
});
export type ContextAttachments = z.infer<typeof ContextAttachments>;
