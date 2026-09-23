/* UnanchoredAnnotations — footer list for LineAnnotations whose key isn't a
   rendered line in this file's diff (D7, spec 08). Mirrors OutdatedComments'
   shape: same wrap/title styling, a different content source. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cs } from "../comments";
import type { LineAnnotation } from "../annotations";

export function UnanchoredAnnotations({ annotations }: { annotations: LineAnnotation[] }) {
  const t = useTranslations("shell");
  if (annotations.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.outsideDiffTitle")}</span>
      {annotations.map((a) => (
        <React.Fragment key={a.id}>{a.node}</React.Fragment>
      ))}
    </div>
  );
}
