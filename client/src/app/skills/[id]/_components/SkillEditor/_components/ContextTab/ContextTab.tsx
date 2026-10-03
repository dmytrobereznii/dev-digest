/* ContextTab — the skill side of Project Context. Attached documents are
   inherited by every agent that uses the skill; the "Serializes as" box shows
   the path list appended to the skill's prompt section. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocList } from "@/components/project-context/ContextDocList";
import { serializeSpecList } from "@/components/project-context/helpers";
import { useContextAttachments } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const attached = useContextAttachments("skills", skill.id, repoId).data?.paths ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedCount", { count: attached.length })}
        </Badge>
      </div>
      <p style={s.hint}>{t("context.inherit")}</p>
      <ContextDocList owner="skills" ownerId={skill.id} />
      {attached.length > 0 && (
        <div style={s.serializes}>
          <div style={s.serializesLabel}>{t("context.serializesAs")}</div>
          <pre className="mono" style={s.serializesBox}>
            {serializeSpecList(attached)}
          </pre>
        </div>
      )}
    </div>
  );
}
