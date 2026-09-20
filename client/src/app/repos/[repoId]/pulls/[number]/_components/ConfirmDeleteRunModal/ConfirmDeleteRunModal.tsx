/* Confirmation for deleting a run from the PR's history. Replaces a
   `window.confirm`, which blocked the event loop, could not be translated or
   styled, and — because RTL cannot drive a native dialog — made the whole
   delete path untestable. Built in the CreateAgentModal shape. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ConfirmDeleteRunModal({
  onConfirm,
  onClose,
  pending,
}: {
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("prReview");

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("detail.deleteRun.title")}
      subtitle={t("detail.deleteRun.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("detail.deleteRun.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} disabled={pending}>
            {t("detail.deleteRun.confirm")}
          </Button>
        </div>
      }
    >
      <p style={s.body}>{t("detail.deleteRun.body")}</p>
    </Modal>
  );
}
