"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { VerdictBanner } from "../VerdictBanner";
import { briefVerdict } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  reviews: ReviewRecord[] | undefined;
  runs: RunSummary[] | undefined;
}

/* The design's PR Brief (screen_pr_detail.jsx BriefCard): verdict banner, then
   the two-column grid. Intent fills the left column; the right one holds a
   Blast radius placeholder until L04 builds the real card. */
export function OverviewTab({ prId, reviews, runs }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const tb = useTranslations("brief");
  const verdict = briefVerdict(reviews, runs);
  return (
    <section style={s.briefSection}>
      <SectionLabel icon="FileText">{t("overview.prBrief")}</SectionLabel>
      <div style={s.briefStack}>
        {verdict ? (
          <VerdictBanner
            verdict={verdict.review.verdict}
            summary={verdict.review.summary}
            score={verdict.review.score}
            findingsCount={verdict.review.findings.length}
            blockers={verdict.blockers}
            cost={{
              usd: verdict.run?.cost_usd ?? verdict.review.cost_usd,
              tokensIn: verdict.run?.tokens_in ?? null,
              tokensOut: verdict.run?.tokens_out ?? null,
            }}
          />
        ) : (
          <div style={s.noReview}>{t("overview.noReview")}</div>
        )}
        <div style={s.briefGrid}>
          <IntentCard prId={prId} />
          {/* L04 replaces this with the real Blast radius card. */}
          <Card style={s.placeholderCard}>
            <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>
            <div style={s.placeholderBody}>
              <Icon.Workflow size={22} style={s.placeholderIcon} />
              <p style={s.placeholderText}>{tb("blastComingSoon")}</p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
