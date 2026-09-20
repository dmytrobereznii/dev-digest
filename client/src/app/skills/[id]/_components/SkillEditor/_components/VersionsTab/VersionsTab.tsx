/* VersionsTab — the skill's append-only history (screen_skills.jsx:165).

   Restore ships; Diff does not (spec D8) — the button is omitted rather than
   disabled. Restoring writes the chosen body back as a NEW version, noted
   `Restored from vN` by the server, so nothing here ever mutates history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { SKELETON_ROWS, SKELETON_ROW_HEIGHT } from "./constants";
import { s } from "./styles";

/** ISO timestamp → a plain local date; the raw string if it will not parse. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.list}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <Skeleton key={i} height={SKELETON_ROW_HEIGHT} />
          ))}
        </div>
      </div>
    );
  }

  const rows = versions ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.heading")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: rows.length })}</Badge>
      </div>
      <p style={s.blurb}>{t("versions.blurb")}</p>

      {isError && <div style={s.error}>{t("versions.loadError")}</div>}
      {restore.isError && <div style={s.error}>{t("versions.restoreError")}</div>}

      {rows.length === 0 && !isError ? (
        <EmptyState
          icon="History"
          title={t("versions.empty.title")}
          body={t("versions.empty.body")}
        />
      ) : (
        <div style={s.list}>
          {rows.map((v) => {
            const current = v.version === skill.version;
            return (
              <div key={v.version} style={s.row(current)}>
                <span className="mono" style={s.chip(current)}>
                  {t("versions.version", { version: v.version })}
                </span>
                <div style={s.meta}>
                  {/* A blank note renders as an em-dash, not an empty row. */}
                  <div style={s.note}>{v.note?.trim() || t("versions.noNote")}</div>
                  <div style={s.date}>{formatWhen(v.created_at)}</div>
                </div>
                {current ? (
                  <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate({ id: skill.id, version: v.version })}
                  >
                    {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
