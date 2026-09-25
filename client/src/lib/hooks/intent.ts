/* hooks/intent.ts — React Query hooks for PR intent (L03 §6):
   GET the cached PrIntentRecord (never calls the LLM) and POST to derive (or
   force re-derive) one. Modelled on hooks/reviews.ts; mutation errors surface
   through the global MutationCache toast (lib/providers.tsx), so no local
   notify.error is needed here. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

/** The cached intent row for a PR, or `{ intent: null }` before any derivation.
    Never triggers the LLM (GET is read-only, D2). */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get(`/pulls/${prId}/intent`, PrIntentResponse),
    enabled: !!prId,
  });
}

/** Derive (or, with `force`, re-derive) intent for a PR. On success the fresh
    row is written straight into the query cache. On a classifier failure the
    route responds 502 and the previous row is kept — the query cache is left
    untouched, so the card keeps showing what it had. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) =>
      api.post(`/pulls/${prId}/intent`, { force: opts?.force ?? false }, PrIntentRecord),
    onSuccess: (data) => {
      if (prId) qc.setQueryData(["pr-intent", prId], { intent: data });
    },
  });
}
