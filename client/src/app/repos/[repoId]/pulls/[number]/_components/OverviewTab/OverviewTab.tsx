"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { VerdictBanner } from "../VerdictBanner";
import { briefVerdict } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  reviews: ReviewRecord[] | undefined;
  runs: RunSummary[] | undefined;
  repoFullName: string | null;
  headSha: string | null;
}

/* The design's PR Brief (screen_pr_detail.jsx BriefCard): verdict banner, then
   the two-column grid. Intent fills the left column; Blast radius (spec 10)
   fills the right one. */
export function OverviewTab({ prId, reviews, runs, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
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
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>
    </section>
  );
}
