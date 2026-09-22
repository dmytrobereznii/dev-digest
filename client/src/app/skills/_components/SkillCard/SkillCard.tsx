/* SkillCard — type-tinted tile, mono name, enabled toggle, type pill + source,
   current version, a delete control, and a footer rule carrying `N agents`.

   The artboard's footer also reads `X% pull · Y% accept`; both are dropped
   (spec D7) because only the agent count is computable today — the other two
   need per-skill run attribution that nothing records, and inventing them is
   worse than omitting them.

   Delete is opt-in per caller (`deletable`): the list wants it, the editor's
   left rail does not — a rail row deleting the skill you are editing would
   pull the page out from under itself. Both the card and the editor's Danger
   zone open the SAME dialog, `DeleteSkillModal`, which needs no success
   callback here: `useDeleteSkill` invalidates the `skills` query itself, so
   the tile disappears without this component asking for anything.

   Everything from @devdigest/shared is `import type`: a value import of a Zod
   schema type-checks and unit-tests green while `next build` fails (§5.7). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "@/lib/hooks/skills";
import { skillTypeColor } from "@/lib/skill-type";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { needsVetting, sourceIcon } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  agentCount,
  onClick,
  onToggle,
  deletable,
}: {
  sk: Skill;
  active?: boolean;
  agentCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  deletable?: boolean;
}) {
  const t = useTranslations("skills");
  const [confirming, setConfirming] = React.useState(false);
  /* `N agents` comes from GET /skills/:id/agents, which is per-skill by design
     — so a card left to itself fetches its own count. A caller that already has
     the number passes `agentCount` and the query stays disabled. */
  const linked = useSkillAgents(agentCount == null ? sk.id : undefined);
  const count = agentCount ?? linked.data?.length ?? 0;

  const color = skillTypeColor(sk.type);
  const SourceIcon = Icon[sourceIcon(sk.source)];
  const vetting = needsVetting(sk);

  return (
    <div onClick={onClick} style={s.card(!!active, sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {sk.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={sk.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {deletable && (
          <button
            type="button"
            title={t("danger.action")}
            aria-label={t("danger.actionFor", { name: sk.name })}
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

      <div style={s.description}>{sk.description}</div>

      <div style={s.metaRow}>
        <span style={s.typePill(color)}>{t(`listItem.type.${sk.type}`)}</span>
        {/* The live version, so the list answers "which one is this?" without
            opening the editor — the same number the editor header shows. */}
        <span className="mono tnum" style={s.versionPill}>
          {t("listItem.version", { version: sk.version })}
        </span>
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${sk.source}`)}
        </span>
        {vetting && (
          <span style={s.vetting} title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>

      {count > 0 && (
        <div style={s.footer}>
          <span className="tnum">{t("listItem.agents", { count })}</span>
        </div>
      )}

      {/* Outside the card's onClick: the dialog is not part of the tile, and a
          click inside it must not navigate to the skill behind it. */}
      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <DeleteSkillModal skill={sk} onClose={() => setConfirming(false)} />
        </div>
      )}
    </div>
  );
}
