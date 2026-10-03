/* DocTypeBadge — the type pill on a project document row and preview. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ProjectDocumentType } from "@devdigest/shared";
import { DOC_TYPE_COLORS } from "./constants";

export function DocTypeBadge({ type }: { type: ProjectDocumentType }) {
  const t = useTranslations("context");
  const c = DOC_TYPE_COLORS[type];
  return (
    <Badge color={c.color} bg={c.bg}>
      {t(`type.${type}`)}
    </Badge>
  );
}
