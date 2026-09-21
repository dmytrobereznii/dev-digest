/* DeleteAgentModal — confirm before an agent is removed from the database.

   Replaces a `window.confirm`, which could not be styled, carried a hardcoded
   English string past next-intl, and offers no way out but OK/Cancel. This is
   the same dialog shape the skill delete uses: confirm, cancel, and the kit
   Modal's own close control.

   It names the skills the agent has linked. Nothing about them is destroyed —
   `agent_skills` rows cascade, the skills themselves stay — and saying so is
   the point: the count looks alarming otherwise. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { useAgentSkills } from "@/lib/hooks/skills";
import { CONFIRM_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function DeleteAgentModal({
  agent,
  onClose,
  onDeleted,
}: {
  agent: Agent;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const remove = useDeleteAgent();
  const { data: links } = useAgentSkills(agent.id);
  const linkedCount = links?.length ?? 0;

  const confirmDelete = () =>
    remove.mutate(agent.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
      },
    });

  return (
    <Modal
      width={CONFIRM_MODAL_WIDTH}
      title={t("danger.confirmTitle", { name: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("danger.cancel")}
          </Button>
          <div style={{ marginLeft: "auto" }}>
            <Button kind="danger" icon="Trash" onClick={confirmDelete} disabled={remove.isPending}>
              {remove.isPending ? t("danger.deleting") : t("danger.confirm")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <span style={s.text}>{t("danger.body")}</span>
        <span style={s.text}>
          {linkedCount > 0 ? t("danger.unlinks", { count: linkedCount }) : t("danger.noSkills")}
        </span>
        {remove.isError && <span style={s.error}>{t("danger.deleteError")}</span>}
      </div>
    </Modal>
  );
}
