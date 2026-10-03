/* hooks/brief.ts — React Query hooks for the PR brief (L05 spec 12):
   GET the stored PrBriefRecord (never calls the LLM) and POST to generate or
   refresh one. Modelled on hooks/intent.ts. NOT in the hooks barrel — import
   from "@/lib/hooks/brief" directly. Mutation errors also surface through the
   global MutationCache toast (lib/providers.tsx). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { PrBriefRecord, PrBriefResponse } from "@devdigest/shared";

/** How often a read repeats while the server reports a generation running. */
export const BRIEF_POLL_MS = 3000;

/** The stored brief for a PR, or `{ brief: null }` before any generation.
    Read-only: never triggers the LLM. Re-reads every 3 s while `generating`. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get(`/pulls/${prId}/brief`, PrBriefResponse),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.generating ? BRIEF_POLL_MS : false),
  });
}

/** Generate (or refresh) the brief. On success the returned record is written
    straight into the cache; on failure the cache is left untouched, so the
    previous brief stays on screen. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/pulls/${prId}/brief`, {}, PrBriefRecord),
    onSuccess: async (data) => {
      if (!prId) return;
      // A poll sent before the server finished must not land after this write.
      await qc.cancelQueries({ queryKey: ["pr-brief", prId] });
      qc.setQueryData(["pr-brief", prId], { brief: data, generating: false });
    },
    // A 409 brief_in_progress (another tab generating) or any other failure:
    // re-read so `generating` is picked up and the poll takes over. The read
    // keeps the previous brief on failure, so the old brief stays on screen.
    onError: () => {
      if (prId) void qc.invalidateQueries({ queryKey: ["pr-brief", prId] });
    },
  });
}
