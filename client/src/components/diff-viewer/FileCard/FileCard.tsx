/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionAnnotations, type LineAnnotation } from "../annotations";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnanchoredAnnotations } from "../UnanchoredAnnotations";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Annotations anchored to a given parsed line (RIGHT=new, LEFT=old). */
function annotationsForLine(
  ln: Line,
  matched: Map<string, LineAnnotation[]>,
): LineAnnotation[] {
  if (matched.size === 0) return [];
  const out: LineAnnotation[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  annotations,
  flagged,
  startClosed,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Generic (marker, node) pairs keyed to this file's rendered lines (D7). */
  annotations?: LineAnnotation[];
  /** Shows a dot after the path, separate from the comment counter (D10). */
  flagged?: boolean;
  /** Overrides the auto-expand-by-size default and starts the card closed (D6). */
  startClosed?: boolean;
}) {
  const t = useTranslations("shell");
  // A file with findings always opens (D6), even over startClosed or the
  // size cap; otherwise startClosed wins, then the auto-expand size rule.
  const [open, setOpen] = React.useState(
    flagged
      ? true
      : startClosed
        ? false
        : (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Same matched/unanchored split for the generic annotation seam (D7).
  const { matched: annMatched, unanchored } = React.useMemo(() => {
    if (!annotations || annotations.length === 0)
      return { matched: new Map<string, LineAnnotation[]>(), unanchored: [] };
    return partitionAnnotations(annotations, renderedKeys);
  }, [annotations, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {flagged && (
          <span data-testid="finding-dot" style={s.findingDot} title={t("diffViewer.hasFindings")} />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                annotations={annotationsForLine(ln, annMatched)}
                commenting={commenting}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          <UnanchoredAnnotations annotations={unanchored} />
        </div>
      )}
    </div>
  );
}
