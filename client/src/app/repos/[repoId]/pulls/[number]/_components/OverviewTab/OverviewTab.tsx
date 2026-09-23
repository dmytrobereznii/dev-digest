"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <section style={s.briefSection}>
        <SectionLabel icon="FileText">{t("overview.prBrief")}</SectionLabel>
        {/* The design's two-column brief grid (screen_pr_detail.jsx BriefCard).
            Intent fills the left column; the right one stays empty until L04
            adds Blast radius. */}
        <div style={s.briefGrid}>
          <IntentCard prId={prId} />
        </div>
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
