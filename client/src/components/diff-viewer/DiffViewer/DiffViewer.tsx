/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import type { LineAnnotation } from "../annotations";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  annotations,
  flaggedPaths,
  startClosed,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Per-file annotations, keyed by path (D7). */
  annotations?: Map<string, LineAnnotation[]>;
  /** Paths whose FileCard shows the finding dot (D10). */
  flaggedPaths?: Set<string>;
  /** Overrides every FileCard's auto-expand default (D6). */
  startClosed?: boolean;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          annotations={annotations?.get(f.path)}
          flagged={flaggedPaths?.has(f.path)}
          startClosed={startClosed}
        />
      ))}
    </div>
  );
}
