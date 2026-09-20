/* hooks/skills.ts — React Query hooks for the Skills Lab (list, editor,
   versions) and for the agent editor's Skills tab.

   Modelled on hooks/agents.ts: one hook per endpoint, query keys mirroring the
   route shape, mutations invalidating the collections they touch.

   Everything from @devdigest/shared is `import type` on purpose — a value
   import of a Zod schema type-checks and unit-tests green but breaks
   `next build` (client INSIGHTS.md). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink, Skill, SkillType } from "@devdigest/shared";

/** One row of a skill's history. Route-local on the server, so declared here. */
export interface SkillVersionSummary {
  version: number;
  note: string | null;
  created_at: string;
}

/** An agent that has this skill linked — the card footer + delete confirmation. */
export interface SkillAgentRef {
  id: string;
  name: string;
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/**
 * The create form's payload.
 *
 * `source` is NEVER sent: the server maps the provenance checkbox
 * (`source_is_external`) onto `source` + `enabled` itself, so a client cannot
 * claim a third-party body is `manual`. `name` is optional — the server derives
 * it from the body's first `# H1` when blank.
 */
export interface CreateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
  source_is_external?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

/**
 * A partial patch plus an optional one-line `note`, which is recorded only when
 * the body actually changed (the server decides; the client always may send it).
 * Neither `source` nor `source_is_external` is accepted — provenance is set
 * once, at creation.
 */
export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
  note?: string;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, note }: UpdateSkillInput) =>
      api.put<Skill>(`/skills/${id}`, note != null ? { ...patch, note } : patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
      qc.removeQueries({ queryKey: ["skill-agents", id] });
      // A deleted skill drops out of every agent's link list.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** A skill's history, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersionSummary[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/**
 * Restore is append-only: the chosen version's body is written back as a NEW
 * version, so both the skill and its history change.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

/** The agents a skill is linked to — the card footer's `N agents`. */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<SkillAgentRef[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** An agent's linked skills, in prompt order. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Link, unlink and reorder are ONE call: POST the whole ordered set. The
 * endpoint is idempotent, so the tab needs no per-row mutation.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      // The card footers' `N agents` counts move with the links.
      qc.invalidateQueries({ queryKey: ["skill-agents"] });
    },
  });
}
