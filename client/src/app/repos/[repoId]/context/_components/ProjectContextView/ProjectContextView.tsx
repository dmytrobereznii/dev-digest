/* ProjectContextView — /repos/:repoId/context. A document list on the left
   (path + type badge), the selected document rendered read-only on the right
   with "Used by N agents". Refresh re-reads the clone (a refetch of the list;
   it never fetches from the remote).

   States: loading, error, not cloned, empty (names the search pattern), list. */
"use client";

import React from "react";
import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { DocTypeBadge } from "@/components/project-context/DocTypeBadge";
import { DocumentPreview } from "@/components/project-context/DocumentPreview";
import { splitPath } from "@/components/project-context/helpers";
import { useProjectDocuments } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const repoId = useParams<{ repoId: string }>().repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch, isFetching } = useProjectDocuments(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  if (repoNotFound) notFound();

  const crumb = [
    { label: activeRepo?.full_name ?? t("crumbRepoFallback"), mono: true },
    { label: t("title") },
  ];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={28} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState body={t("loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  if (data.status === "not_cloned") {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />
      </AppShell>
    );
  }

  if (data.documents.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Folder"
          title={t("empty.title")}
          body={t("empty.body", { pattern: data.pattern })}
          cta={t("refresh")}
          onCta={() => refetch()}
          ctaLoading={isFetching}
        />
      </AppShell>
    );
  }

  const current = data.documents.find((d) => d.path === selected) ?? data.documents[0]!;

  return (
    <AppShell crumb={crumb}>
      <div style={s.split}>
        <div style={s.list}>
          <div style={s.listHead}>
            <div style={s.listTitle}>{t("title").toUpperCase()}</div>
            <div className="mono" style={s.listPattern}>
              {data.pattern}
            </div>
            <div style={s.listActions}>
              {/* The kit's IconBtn has no disabled prop, so a local button
                  keeps the refresh disabled while fetching. */}
              <button
                type="button"
                title={t("refresh")}
                aria-label={t("refresh")}
                onClick={() => refetch()}
                disabled={isFetching}
                style={{ ...s.iconBtn, opacity: isFetching ? 0.5 : 1 }}
              >
                <Icon.RefreshCw size={16} />
              </button>
            </div>
          </div>
          <div style={s.rows} role="list" aria-label={t("listLabel")}>
            {data.documents.map((d) => {
              const active = d.path === current.path;
              const { name, dir } = splitPath(d.path);
              return (
                <div role="listitem" key={d.path}>
                  <button
                    type="button"
                    className="mono"
                    title={d.path}
                    aria-pressed={active}
                    style={{ ...s.row, ...(active ? s.rowActive : null) }}
                    onClick={() => setSelected(d.path)}
                  >
                    <Icon.FileText
                      size={13}
                      style={{ flexShrink: 0, color: active ? "var(--accent)" : "var(--text-muted)" }}
                    />
                    <span style={s.rowText}>
                      <span style={s.rowName}>{name}</span>
                      {dir ? <span style={s.rowDir}>{dir}</span> : null}
                    </span>
                    <DocTypeBadge type={d.type} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div style={s.pane}>
          <div style={s.paneHead}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {current.path}
            </span>
            <DocTypeBadge type={current.type} />
            <div style={s.paneRight}>
              <span>{t("tokens", { count: current.tokens })}</span>
              <span style={s.usedBy}>
                <Icon.Cpu size={13} />
                {t("usedBy", { count: current.used_by_agents })}
              </span>
            </div>
          </div>
          <DocumentPreview repoId={repoId} path={current.path} />
        </div>
      </div>
    </AppShell>
  );
}
