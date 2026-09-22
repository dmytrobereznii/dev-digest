/* /skills — the Skills Lab list. SkillCards + search + one create button.
   Selecting a skill navigates to the tabbed editor at /skills/:id.

   `Add Skill` is a plain Button, NOT the Dropdown that /agents uses: spec D1
   leaves exactly one destination — there is no file picker, no URL fetch and no
   community drawer in this lesson — and a one-item dropdown is not a dropdown.
   The Dropdown returns with the lesson that adds the other entry points. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
            {t("page.addSkill")}
          </Button>
        </div>

        {/* Kept alongside the route's loading.tsx on purpose: this page is a
            client component fetching through TanStack Query, so the server-side
            Suspense fallback has already resolved before the query starts and
            the two cover different moments (client INSIGHTS.md, measured). */}
        {isLoading && (
          <div style={s.grid}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("create.subtitle")}
            cta={t("page.addSkill")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                sk={sk}
                onClick={() => router.push(`/skills/${sk.id}?tab=config`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                deletable
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
