/* ContextDocList — the active repository's documents as checkbox rows, shared
   by the agent and skill Context tabs. Checking attaches the path to the owner
   for that repository; unchecking detaches it. The filter is display-only, and
   the token total follows the checked rows. An attached path the repository no
   longer lists stays visible as a missing row so it can still be detached. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useAttachContext,
  useContextAttachments,
  useDetachContext,
  useProjectDocuments,
  type ContextOwner,
} from "@/lib/hooks/project-context";
import { DocTypeBadge } from "../DocTypeBadge";
import { DocumentPreview } from "../DocumentPreview";
import { filterDocuments, missingPaths, splitPath, sumTokens } from "../helpers";
import { s } from "./styles";

export function ContextDocList({ owner, ownerId }: { owner: ContextOwner; ownerId: string }) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const [filter, setFilter] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  const docs = useProjectDocuments(repoId);
  const attachments = useContextAttachments(owner, ownerId, repoId);
  const attach = useAttachContext();
  const detach = useDetachContext();

  if (!repoId) {
    return <EmptyState icon="Folder" title={t("list.noRepo.title")} body={t("list.noRepo.body")} />;
  }
  if (docs.isLoading) {
    return (
      <div style={s.skeleton}>
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }
  if (docs.isError || !docs.data) {
    return <ErrorState body={t("loadError")} onRetry={() => docs.refetch()} />;
  }
  if (docs.data.status === "not_cloned") {
    return <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />;
  }

  const all = docs.data.documents;
  const attached = attachments.data?.paths ?? [];
  const checked = new Set(attached);
  const missing = missingPaths(attached, all);
  const visible = filterDocuments(all, filter);
  const visibleMissing = missing.filter((p) => p.toLowerCase().includes(filter.trim().toLowerCase()));
  const toggle = (path: string, on: boolean) =>
    (on ? detach : attach).mutate({ owner, ownerId, repoId, path });

  return (
    <div>
      <div style={s.bar}>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("list.filterPlaceholder")} />
        </div>
        <span style={s.total}>{t("list.tokenTotal", { count: sumTokens(all, attached) })}</span>
      </div>

      {all.length === 0 && missing.length === 0 ? (
        <EmptyState
          icon="Folder"
          title={t("empty.title")}
          body={t("empty.body", { pattern: docs.data.pattern })}
        />
      ) : (
        <div style={s.list} role="list" aria-label={t("listLabel")}>
          {visible.map((d) => {
            const { name, dir } = splitPath(d.path);
            const isOpen = open === d.path;
            return (
              <div key={d.path} role="listitem" style={s.item}>
                <div style={s.row}>
                  <input
                    type="checkbox"
                    aria-label={name}
                    checked={checked.has(d.path)}
                    onChange={() => toggle(d.path, checked.has(d.path))}
                  />
                  <div style={s.text}>
                    <span className="mono" style={s.name}>
                      {name}
                    </span>
                    {dir && (
                      <span className="mono" style={s.dir}>
                        {dir}
                      </span>
                    )}
                  </div>
                  <DocTypeBadge type={d.type} />
                  <Button
                    kind="ghost"
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : d.path)}
                  >
                    {t("list.preview")}
                  </Button>
                </div>
                {isOpen && (
                  <div style={s.preview}>
                    <DocumentPreview repoId={repoId} path={d.path} />
                  </div>
                )}
              </div>
            );
          })}
          {visibleMissing.map((path) => {
            const { name, dir } = splitPath(path);
            return (
              <div key={path} role="listitem" style={s.itemMissing}>
                <div style={s.row}>
                  <div style={s.text}>
                    <span className="mono" style={s.name}>
                      {name}
                    </span>
                    {dir && (
                      <span className="mono" style={s.dir}>
                        {dir}
                      </span>
                    )}
                    <span style={s.missing}>{t("list.missing")}</span>
                  </div>
                  <Button
                    kind="ghost"
                    size="sm"
                    aria-label={t("list.detachNamed", { name })}
                    onClick={() => detach.mutate({ owner, ownerId, repoId, path })}
                  >
                    {t("list.detach")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
