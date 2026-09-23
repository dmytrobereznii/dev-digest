/* RoleGroup — one Smart Diff role: a collapsible header (chevron, colour
   swatch, label, description, "● N" + "N files") over a DiffViewer scoped to
   the group's files (D3, D6, D10, D11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type LineAnnotation } from "@/components/diff-viewer";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_UI } from "../../constants";
import type { ViewGroupFile } from "../../helpers";
import { s, swatchStyle, chevronFor } from "./styles";

export function RoleGroup({
  role,
  files,
  commenting,
  annotations,
}: {
  role: SmartDiffRole;
  files: ViewGroupFile[];
  commenting?: DiffCommentApi;
  annotations: Map<string, LineAnnotation[]>;
}) {
  const t = useTranslations("prReview");
  const ui = ROLE_UI[role];
  const [open, setOpen] = React.useState(ui.groupOpen);

  const flaggedPaths = React.useMemo(
    () => new Set(files.filter((f) => f.findingLines.length > 0).map((f) => f.file.path)),
    [files],
  );

  return (
    <div style={s.group}>
      <div onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={swatchStyle(ui.color)} />
        <span style={s.label}>{t(ui.labelKey)}</span>
        <span style={s.desc}>{t(ui.descKey)}</span>
        <div style={s.right}>
          {flaggedPaths.size > 0 && (
            <span
              className="tnum"
              style={s.flagCount}
              title={t("smartDiff.filesWithFindings", { count: flaggedPaths.size })}
            >
              ● {flaggedPaths.size}
            </span>
          )}
          <span className="tnum" style={s.filesCount}>
            {t("smartDiff.filesCount", { count: files.length })}
          </span>
        </div>
      </div>
      {open && (
        <DiffViewer
          files={files.map((f) => f.file)}
          commenting={commenting}
          annotations={annotations}
          flaggedPaths={flaggedPaths}
        />
      )}
    </div>
  );
}
