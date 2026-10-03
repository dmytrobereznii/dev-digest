"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { usePrBrief } from "@/lib/hooks/brief";
import { BriefSummary } from "../BriefSummary";
import { IntentCard } from "../IntentCard";
import { ReviewFocus } from "../ReviewFocus";
import { RiskAreas } from "../RiskAreas";
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
  /** Opens a file at a line on the Files changed tab (Review focus entries). */
  onOpenFile?: (file: string, line: number) => void;
}

/* The design's PR Brief (screen_pr_detail.jsx BriefCard): verdict banner (or
   the not-reviewed note), the brief's summary block, then the two-column grid.
   Intent fills the left column with Risk areas inside it; Blast radius (spec
   10) fills the right one. Review focus spans the width below the grid. */
export function OverviewTab({
  prId,
  reviews,
  runs,
  repoFullName,
  headSha,
  onOpenFile,
}: OverviewTabProps) {
  const t = useTranslations("prReview");
  const brief = usePrBrief(prId).data?.brief ?? null;
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
        <BriefSummary prId={prId} />
        <div style={s.briefGrid}>
          <IntentCard prId={prId}>
            {brief && <RiskAreas risks={brief.risks.risks} />}
          </IntentCard>
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
        {brief && <ReviewFocus items={brief.review_focus} onOpen={onOpenFile} />}
      </div>
    </section>
  );
}
