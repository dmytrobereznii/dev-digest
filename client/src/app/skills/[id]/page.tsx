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
import { SkillCard } from "../_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { SKILL_TYPE_COLOR, TABS } from "./_components/SkillEditor/constants";

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

  const tint = skill ? SKILL_TYPE_COLOR[skill.type] : SKILL_TYPE_COLOR.custom;

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* left: skill list */}
        <div
          style={{
            width: 290,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h1 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{t("page.heading")}</h1>
              <Button kind="ghost" size="sm" onClick={() => router.push("/skills")}>
                {t("detail.back")}
              </Button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
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
          <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 24px 0",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: `${tint}1f`,
                  color: tint,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon.Sparkles size={15} />
              </div>
              <h1 className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                {skill.name}
              </h1>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: tint,
                  background: `${tint}1a`,
                  padding: "2px 8px",
                  borderRadius: 5,
                }}
              >
                {t(`listItem.type.${skill.type}`)}
              </span>
              <Badge color="var(--text-secondary)" icon="GitCommit">
                {t("config.version", { version: skill.version })}
              </Badge>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
