/* DeleteSkillModal — the one confirm dialog for deleting a skill.

   Segment rung: both the card on /skills and the Danger zone on /skills/:id
   open it, and the criterion the card satisfies ("Delete opens a modal with
   confirm / cancel / close") is the same dialog in both places. `onDeleted`
   is what differs — the card stays put, the editor navigates back to the list.

   It names the agents the delete would strip the skill from: a delete that
   silently unlinks it from three agents is the surprise the copy warns about.
   That list is fetched only while the dialog is open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useSkillAgents } from "@/lib/hooks/skills";
import { CONFIRM_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: Skill;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const remove = useDeleteSkill();
  const { data: agents } = useSkillAgents(skill.id);

  const confirmDelete = () =>
    remove.mutate(skill.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
      },
    });

  return (
    <Modal
      width={CONFIRM_MODAL_WIDTH}
      title={t("danger.confirmTitle", { name: skill.name })}
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
          {agents && agents.length > 0
            ? t("danger.usedBy", { count: agents.length })
            : t("danger.notUsed")}
        </span>
        {agents && agents.length > 0 && (
          <div style={s.agentList}>
            {agents.map((a) => (
              <Badge key={a.id} color="var(--text-secondary)" mono>
                {a.name}
              </Badge>
            ))}
          </div>
        )}
        {remove.isError && <span style={s.error}>{t("danger.deleteError")}</span>}
      </div>
    </Modal>
  );
}
