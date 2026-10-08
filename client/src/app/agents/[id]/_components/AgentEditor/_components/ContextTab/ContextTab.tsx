/* ContextTab — the agent side of Project Context: which of the active
   repository's documents are injected into this agent's runs. */

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocList } from "@/components/project-context/ContextDocList";
import { missingPaths } from "@/components/project-context/helpers";
import { useContextAttachments, useProjectDocuments } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const docs = useProjectDocuments(repoId);
  const attachments = useContextAttachments("agents", agent.id, repoId);

  const listed = docs.data?.status === "ok" ? docs.data.documents : null;
  const attached = attachments.data?.paths ?? [];
  const found = listed ? attached.length - missingPaths(attached, listed).length : 0;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        {listed && (
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {t("context.attachedCount", { attached: found, total: listed.length })}
          </Badge>
        )}
      </div>
      <p style={s.hint}>{t("context.hint")}</p>
      <ContextDocList owner="agents" ownerId={agent.id} />
    </div>
  );
}
