/* PreviewTab — the skill body as an agent's reader sees it, not as source.

   Config already shows the body as raw Markdown in `CodeEditor`; this tab is
   the other half of that pair and renders it. It is read-only on purpose:
   two editable surfaces for one field is a merge conflict with yourself. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown, estimateTokens } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const body = skill.body?.trim() ?? "";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("preview.heading")}</h2>
        {/* The same estimate the Config editor and the run trace show, so the
            three never disagree about what this body "costs". */}
        <Badge color="var(--text-secondary)" icon="Hash">
          {t("preview.tokens", { count: estimateTokens(body) })}
        </Badge>
      </div>
      <p style={s.blurb}>{t("preview.blurb")}</p>

      <div style={s.sheet}>
        {body === "" ? <div style={s.empty}>{t("preview.empty")}</div> : <Markdown>{body}</Markdown>}
      </div>
    </div>
  );
}
