/* hooks/blast.ts — React Query hook for PR blast radius (L04 spec 10 §6.1):
   GET the precomputed downstream-caller map (server's blast/ module reads
   repo-intel; there is no model call and no fresh analysis). Modelled on
   hooks/intent.ts. NOT in the hooks barrel (frontend-architecture § barrels)
   — import from "@/lib/hooks/blast" directly. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BlastRadiusResponse } from "@devdigest/shared";

/** The blast-radius map for a PR: changed symbols, downstream callers grouped
    by symbol, and the endpoints/crons those callers' files touch. Always a
    read of the index the server already built — never triggers analysis. */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get(`/pulls/${prId}/blast`, BlastRadiusResponse),
    enabled: !!prId,
  });
}
