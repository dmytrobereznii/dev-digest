/* SkillsTab — the agent side of the agent↔skill link (screen_agents.jsx:36).

   Checking, unchecking and reordering all resolve to ONE call: POST the whole
   ordered skill_ids set. That endpoint already exists and is idempotent, so
   this tab adds no server surface. The filter is display-only — the payload is
   always the full ordered list.

   Reordering is drag-and-drop on the grip handle, with ↑/↓ as the keyboard
   path (see constants.ts). Only LINKED rows drag: an unlinked skill has no
   position in the prompt to move.

   Linking deliberately does NOT bump the agent's version: `setSkills` skips
   `snapshotVersion`, so a reorder cannot mint an agent version per drop.
   `agent_versions` exists for eval reproducibility (L06), which has nothing to
   replay yet. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { skillTypeColor } from "@/lib/skill-type";
import { matchesFilter, moveLink, orderSkills, reorderLink, toggleLink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const rows = orderSkills(skills ?? [], links ?? []);
  const linkedIds = rows.filter((r) => r.linked).map((r) => r.skill.id);
  const visible = rows.filter((r) => matchesFilter(r.skill, filter));

  const commit = (skillIds: string[]) => setSkills.mutate({ agentId: agent.id, skillIds });

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  const drop = (targetId: string) => {
    if (!dragId) return;
    const next = reorderLink(linkedIds, dragId, targetId);
    // `reorderLink` returns the same array for a no-op drop (onto itself, or
    // onto an unlinked row) — don't POST an unchanged set.
    if (next !== linkedIds) commit(next);
    endDrag();
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linkedIds.length, total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <TextInput
            value={filter}
            onChange={setFilter}
            placeholder={t("skills.filterPlaceholder")}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.list}>
        {visible.map((r) => {
          const at = linkedIds.indexOf(r.skill.id);
          const color = skillTypeColor(r.skill.type);
          return (
            <div
              key={r.skill.id}
              draggable={r.linked}
              aria-grabbed={r.linked ? dragId === r.skill.id : undefined}
              onDragStart={(e) => {
                setDragId(r.skill.id);
                // Firefox ignores a drag with no payload set.
                e.dataTransfer.setData("text/plain", r.skill.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId || !r.linked) return;
                // Without preventDefault the browser refuses the drop outright.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverId(r.skill.id);
              }}
              onDragLeave={() => setOverId((cur) => (cur === r.skill.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                drop(r.skill.id);
              }}
              onDragEnd={endDrag}
              style={s.row(r.linked, dragId === r.skill.id, overId === r.skill.id)}
            >
              <Icon.Menu
                size={14}
                style={s.handle(r.linked)}
                aria-hidden
                data-testid={`grip-${r.skill.id}`}
              />
              <button
                type="button"
                role="checkbox"
                aria-checked={r.linked}
                aria-label={r.skill.name}
                onClick={() => commit(toggleLink(linkedIds, r.skill.id))}
                style={s.box(r.linked)}
              >
                {r.linked && <Icon.Check size={11} style={{ color: "#fff" }} />}
              </button>
              <span className="mono" style={s.name}>
                {r.skill.name}
              </span>
              <span style={s.pill(color)}>{r.skill.type}</span>
              {r.linked ? (
                <div style={s.moves}>
                  {at > 0 && (
                    <IconBtn
                      icon="ArrowUp"
                      label={t("skills.moveUp")}
                      size={24}
                      onClick={() => commit(moveLink(linkedIds, r.skill.id, -1))}
                    />
                  )}
                  {at < linkedIds.length - 1 && (
                    <IconBtn
                      icon="ArrowDown"
                      label={t("skills.moveDown")}
                      size={24}
                      onClick={() => commit(moveLink(linkedIds, r.skill.id, 1))}
                    />
                  )}
                </div>
              ) : (
                <div style={s.movesSpacer} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
