/* /skills/:id — Skill editor. Left rail of skill cards + the tabbed editor,
   structurally the same file as agents/[id]/page.tsx (spec D3: the Skills Lab
   "mirrors the Agent editor"). Tab state lives in ?tab=.

   The artboard's `Run on evals` button is Evals-tab machinery and is omitted
   (D7) rather than shipped dead. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { skillTypeColor } from "@/lib/skill-type";
import { SkillCard } from "../_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { TABS } from "./_components/SkillEditor/constants";
import { s } from "./styles";

/** The route gates on exactly the tabs the editor ships (D7). */
const VALID_TABS = TABS.map((tb) => tb.key);

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("skills");
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={isError ? t("detail.loadError") : t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.notFound.body")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const tint = skillTypeColor(skill?.type ?? "custom");

  return (
    <AppShell crumb={crumb}>
      <div style={s.frame}>
        {/* left: skill list */}
        <div style={s.rail}>
          <div style={s.railHead}>
            <div style={s.railHeadRow}>
              <h1 style={s.railTitle}>{t("page.heading")}</h1>
              <Button kind="ghost" size="sm" onClick={() => router.push("/skills")}>
                {t("detail.back")}
              </Button>
            </div>
          </div>
          <div style={s.railList}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                sk={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {isLoading || !skill ? (
          <div style={s.paneSkeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.pane}>
            <div style={s.paneHead}>
              <div style={s.iconBox(tint)}>
                <Icon.Sparkles size={15} />
              </div>
              <h1 className="mono" style={s.skillName}>
                {skill.name}
              </h1>
              <span style={s.typePill(tint)}>{t(`listItem.type.${skill.type}`)}</span>
              <Badge color="var(--text-secondary)" icon="GitCommit">
                {t("config.version", { version: skill.version })}
              </Badge>
            </div>
            <div style={s.paneBody}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
