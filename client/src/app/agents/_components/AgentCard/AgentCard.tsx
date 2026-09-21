/* AgentCard — model chip, skills count, enabled toggle, delete. Stats are an A5
   mount; we render the provider/model + skill count here.

   Delete is opt-in per caller (`deletable`): the list wants it, the editor's
   left rail does not — a rail row deleting the agent you are editing would
   pull the page out from under itself. `useDeleteAgent` invalidates the
   `agents` query, so the tile disappears without a success callback here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { DeleteAgentModal } from "../DeleteAgentModal";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
  deletable,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  deletable?: boolean;
}) {
  const t = useTranslations("agents");
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);

  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {deletable && (
          <button
            type="button"
            title={t("danger.action")}
            aria-label={t("danger.actionFor", { name: ag.name })}
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>

      {/* Outside the card's onClick: a click inside the dialog must not
          navigate to the agent behind it. */}
      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <DeleteAgentModal agent={ag} onClose={() => setConfirming(false)} />
        </div>
      )}
    </div>
  );
}
