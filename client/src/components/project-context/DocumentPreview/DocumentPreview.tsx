/* DocumentPreview — a document's current content rendered as Markdown,
   read-only. Shared by the Project Context page and the Context tabs. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useProjectDocumentContent } from "@/lib/hooks/project-context";
import { s } from "./styles";

export function DocumentPreview({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useProjectDocumentContent(repoId, path);

  if (isLoading) {
    return (
      <div style={s.body} aria-label={t("contentLoading")}>
        <Skeleton height={22} width={240} />
        <Skeleton height={14} />
        <Skeleton height={14} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("contentError")} onRetry={() => refetch()} />;
  }
  return (
    <div style={s.body}>
      <div style={s.inner}>
        <Markdown>{data?.content}</Markdown>
      </div>
    </div>
  );
}
