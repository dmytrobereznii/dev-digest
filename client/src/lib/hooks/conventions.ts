/* hooks/conventions.ts — React Query hooks for the Conventions extractor: the
   candidate list, the synchronous re-scan, per-card and bulk triage, and the
   merge that writes ONE skill into the Skills Lab.

   Modelled on hooks/skills.ts: one hook per endpoint, query keys mirroring the
   route shape, mutations invalidating the collections they touch.

   Everything from @devdigest/shared is `import type` on purpose — a value
   import of a Zod schema type-checks and unit-tests green but breaks
   `next build` (client INSIGHTS.md). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionStatus, Skill, SkillType } from "@devdigest/shared";

/**
 * One scan of a repo — what the page's subtitle ("Detected from N sample files
 * · last scan …") is made of.
 *
 * Declared here rather than in `@devdigest/shared` because the server keeps it
 * route-local too: nothing outside the conventions routes needs it, and a
 * contract added to both vendored copies for one subtitle would be new drift
 * surface for no gain. Same precedent as `SkillVersionSummary` above.
 */
export interface ConventionScan {
  id: string;
  sample_count: number;
  model: string;
  created_at: string;
}

/**
 * `GET` and `POST …/extract` return the same envelope. `scan` is `null` before
 * the first extraction ever ran — that null, not an empty candidate list, is
 * what drives the empty state: a scan that ran and grounded nothing still has
 * a row, and still says "last scan 2m ago".
 */
export interface ConventionsPayload {
  scan: ConventionScan | null;
  candidates: ConventionCandidate[];
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsPayload>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Re-scan. Synchronous by design (spec D7) — one model call over ~13 files is
 * not the minutes-long job `repo-intel` polls for, so this resolves with the
 * new scan and its candidates and there is nothing to poll.
 *
 * The response IS the fresh list, so it is written straight into the cache;
 * the invalidate behind it only covers a concurrent reader.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionsPayload>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data);
    },
  });
}

/**
 * Triage one candidate. `status` is the only patchable field — the rule,
 * evidence and confidence are the gate's output, and a hand-edited rule would
 * carry a snippet that no longer describes it. `repoId` is not in the URL; it
 * travels with the variables so the list query can be invalidated.
 */
export function useSetConventionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { repoId: string; id: string; status: ConventionStatus }) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, { status }),
    onSuccess: (_d, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/**
 * Accept all / Deselect all. One call over the whole listed set rather than N
 * per-card mutations — and the server never sweeps a `rejected` row into it,
 * so "Accept all" cannot resurrect something the user threw away.
 *
 * The status is narrowed to the toolbar's two values, matching the route's own
 * body schema: reject is terminal and per-card (D2), so a bulk reject must not
 * be one keystroke away from throwing the whole list away.
 */
export type BulkConventionStatus = Extract<ConventionStatus, "pending" | "accepted">;

export function useSetAllConventionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, status }: { repoId: string; status: BulkConventionStatus }) =>
      api.put<ConventionCandidate[]>(`/repos/${repoId}/conventions/status`, { status }),
    onSuccess: (_d, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/**
 * The merge: the edited draft plus the candidates it came from, written as ONE
 * skill (spec D1).
 *
 * `source` is absent on purpose and there is no `source_is_external` either.
 * This route stamps `source: 'extracted'` itself — a third value a boolean
 * could never pick, and one a client must still never be able to name.
 */
export interface CreateSkillFromConventionsInput {
  repoId: string;
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  convention_ids: string[];
}

export function useCreateSkillFromConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...payload }: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}
