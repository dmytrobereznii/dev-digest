/* hooks/project-context.ts — React Query hooks for Project Context: the
   repository's document list and content, and the documents attached to an
   agent or a skill. Only routes the API serves are requested.

   Everything from @devdigest/shared is `import type` on purpose (client
   INSIGHTS.md: a value import of a schema breaks `next build`). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ContextAttachments,
  ProjectDocumentContent,
  ProjectDocumentList,
} from "@devdigest/shared";

/** Who a document is attached to. */
export type ContextOwner = "agents" | "skills";

export function useProjectDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context", repoId],
    queryFn: () => api.get<ProjectDocumentList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useProjectDocumentContent(
  repoId: string | null | undefined,
  path: string | null | undefined
) {
  return useQuery({
    queryKey: ["project-context-content", repoId, path],
    queryFn: () =>
      api.get<ProjectDocumentContent>(
        `/repos/${repoId}/context/content?path=${encodeURIComponent(path ?? "")}`
      ),
    enabled: !!repoId && !!path,
  });
}

export function useContextAttachments(
  owner: ContextOwner,
  ownerId: string | null | undefined,
  repoId: string | null | undefined
) {
  return useQuery({
    queryKey: ["context-attachments", owner, ownerId, repoId],
    queryFn: () =>
      api.get<ContextAttachments>(`/${owner}/${ownerId}/context?repo_id=${repoId}`),
    enabled: !!ownerId && !!repoId,
  });
}

interface AttachVars {
  owner: ContextOwner;
  ownerId: string;
  repoId: string;
  path: string;
}

/** Attaching or detaching changes the attachment list and "Used by N agents". */
function useInvalidateAfter() {
  const qc = useQueryClient();
  return (v: AttachVars) => {
    qc.invalidateQueries({ queryKey: ["context-attachments", v.owner, v.ownerId, v.repoId] });
    qc.invalidateQueries({ queryKey: ["project-context", v.repoId] });
  };
}

export function useAttachContext() {
  const done = useInvalidateAfter();
  return useMutation({
    mutationFn: (v: AttachVars) =>
      api.post<ContextAttachments>(`/${v.owner}/${v.ownerId}/context`, {
        repo_id: v.repoId,
        path: v.path,
      }),
    onSuccess: (_d, v) => done(v),
  });
}

export function useDetachContext() {
  const done = useInvalidateAfter();
  return useMutation({
    mutationFn: (v: AttachVars) =>
      api.del<ContextAttachments>(
        `/${v.owner}/${v.ownerId}/context?repo_id=${v.repoId}&path=${encodeURIComponent(v.path)}`
      ),
    onSuccess: (_d, v) => done(v),
  });
}
