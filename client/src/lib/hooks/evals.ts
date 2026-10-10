/* hooks/evals.ts — React Query hooks for the eval pipeline (L06).
   Overview per agent, all-agents dashboard, one run's detail, and the
   mutations that create/delete cases and start runs. A running run is
   re-read every EVAL_POLL_MS until it settles. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AgentEvalOverview,
  EvalCase,
  EvalDashboard,
  EvalRunDetail,
  EvalRunSummary,
} from "@devdigest/shared";
import { api } from "../api";
import { EVAL_POLL_MS } from "@/components/eval/constants";

/** `{ ok }` — the acknowledgement the delete route returns. */
const Ok = z.object({ ok: z.boolean() });

/** Cases, newest runs and trend of one agent. Polls while its newest run is running. */
export function useAgentEvals(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-evals", agentId],
    queryFn: () => api.get(`/agents/${agentId}/evals`, AgentEvalOverview),
    enabled: !!agentId,
    refetchInterval: (query) =>
      query.state.data?.runs[0]?.status === "running" ? EVAL_POLL_MS : false,
  });
}

/** Every agent with a case or a run, plus the newest runs across agents. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get("/eval/dashboard", EvalDashboard),
    refetchInterval: (query) =>
      (query.state.data?.recent_runs ?? []).some((r) => r.status === "running")
        ? EVAL_POLL_MS
        : false,
  });
}

/** One run with its prompt and per-case results. Polls while it is running. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get(`/eval-runs/${runId}`, EvalRunDetail),
    enabled: !!runId,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? EVAL_POLL_MS : false,
  });
}

/** Start a run of the agent's current config over its case set. */
export function useRunEvals(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/agents/${agentId}/eval-runs`, undefined, EvalRunSummary),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-evals", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Turn a decided finding into an eval case; the finding gains `eval_case_id`. */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post(`/findings/${findingId}/eval-case`, { finding_id: findingId }, EvalCase),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["agent-evals"] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Delete a case; past runs keep its results. */
export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del(`/eval-cases/${caseId}`, Ok),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-evals", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}
