/* SkillCard — type-tinted tile, mono name, enabled toggle, type pill + source,
   and a footer rule carrying `N agents`.

   The artboard's footer also reads `X% pull · Y% accept`; both are dropped
   (spec D7) because only the agent count is computable today — the other two
   need per-skill run attribution that nothing records, and inventing them is
   worse than omitting them.

   Everything from @devdigest/shared is `import type`: a value import of a Zod
   schema type-checks and unit-tests green while `next build` fails (§5.7). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "@/lib/hooks/skills";
import { needsVetting, sourceIcon, typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  agentCount,
  onClick,
  onToggle,
}: {
  sk: Skill;
  active?: boolean;
  agentCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  /* `N agents` comes from GET /skills/:id/agents, which is per-skill by design
     — so a card left to itself fetches its own count. A caller that already has
     the number passes `agentCount` and the query stays disabled. */
  const linked = useSkillAgents(agentCount == null ? sk.id : undefined);
  const count = agentCount ?? linked.data?.length ?? 0;

  const color = typeColor(sk.type);
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
      </div>

      <div style={s.description}>{sk.description}</div>

      <div style={s.metaRow}>
        <span style={s.typePill(color)}>{t(`listItem.type.${sk.type}`)}</span>
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
    </div>
  );
}
