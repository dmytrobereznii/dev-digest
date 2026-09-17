/* FindingsPopover — read-only preview of one run's findings, hung off the PR
   list's Findings column. Text only, by design: triage (Accept / Reject) lives
   on the PR page's Review runs accordion, not here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel } from "../../[number]/_components/FindingCard/helpers";
import { previewText } from "./helpers";
import { s } from "./styles";

export function FindingsPopover({
  count,
  findings,
  loading,
  error,
}: {
  /** Header count — the row's own severity total, known before the fetch lands. */
  count: number;
  findings: FindingRecord[];
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations("prReview");
  const title = t("list.findingsPopover.title", { count });

  let body: React.ReactNode;
  if (loading) body = <span style={s.status}>{t("list.findingsPopover.loading")}</span>;
  else if (error) body = <span style={s.status}>{t("list.findingsPopover.error")}</span>;
  else
    body = (
      <div style={s.list}>
        {findings.map((f, i) => (
          <div key={f.id} style={s.item(i === findings.length - 1)}>
            <div style={s.titleRow}>
              <SeverityBadge severity={f.severity} compact />
              <span style={s.title}>{f.title}</span>
              <CategoryTag category={f.category as Category} />
            </div>
            <div style={s.metaRow}>
              <span className="mono" style={s.location}>
                {f.file}:{lineLabel(f)}
              </span>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={s.rationale}>{previewText(f.rationale)}</div>
          </div>
        ))}
      </div>
    );

  return (
    <>
      <div style={s.header}>
        <Icon.AlertOctagon size={12} />
        {title}
      </div>
      {body}
    </>
  );
}
