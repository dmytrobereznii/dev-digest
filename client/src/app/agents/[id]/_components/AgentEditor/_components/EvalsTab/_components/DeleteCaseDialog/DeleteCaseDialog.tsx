"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { useDeleteEvalCase } from "@/lib/hooks/evals";

export interface DeleteCaseDialogProps {
  agentId: string;
  evalCase: EvalCase;
  onClose: () => void;
}

/** Confirmation naming the case; shows the API's message inline when the delete fails. */
export function DeleteCaseDialog({ agentId, evalCase, onClose }: DeleteCaseDialogProps) {
  const t = useTranslations("eval.deleteCase");
  const del = useDeleteEvalCase(agentId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Modal
      width={440}
      title={t("title", { name: evalCase.name })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            kind="danger"
            disabled={del.isPending}
            onClick={() => del.mutate(evalCase.id, { onSuccess: onClose })}
          >
            {del.isPending ? t("deleting") : t("confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 13.5 }}>
        <p>{t("body")}</p>
        {del.error instanceof Error && (
          <p role="alert" style={{ color: "var(--crit)", marginTop: 10 }}>
            {del.error.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
