/* SkillsTab — the agent side of the agent↔skill link (screen_agents.jsx:36).

   Checking, unchecking and reordering all resolve to ONE call: POST the whole
   ordered skill_ids set. That endpoint already exists and is idempotent, so
   this tab adds no server surface. The filter is display-only — the payload is
   always the full ordered list.

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
import { SKILL_TYPE_COLOR } from "./constants";
import { matchesFilter, moveLink, orderSkills, toggleLink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const [filter, setFilter] = React.useState("");

  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const rows = orderSkills(skills ?? [], links ?? []);
  const linkedIds = rows.filter((r) => r.linked).map((r) => r.skill.id);
  const visible = rows.filter((r) => matchesFilter(r.skill, filter));

  const commit = (skillIds: string[]) => setSkills.mutate({ agentId: agent.id, skillIds });

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
          const color = SKILL_TYPE_COLOR[r.skill.type];
          return (
            <div key={r.skill.id} style={s.row(r.linked)}>
              {/* Visual affordance only — reordering is the ↑/↓ buttons. */}
              <Icon.Menu size={14} style={s.handle} aria-hidden />
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
