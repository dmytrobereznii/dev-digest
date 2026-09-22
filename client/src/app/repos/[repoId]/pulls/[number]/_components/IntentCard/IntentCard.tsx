/* IntentCard — the design's `IntentBlock` (screen_pr_detail.jsx:3-19) plus the
   D11 additions the design does not draw: a confidence badge, a sources list,
   a footer (model/cost/Re-derive/stale note), an empty state and a skeleton.
   Lives in the PR Brief section of the Overview tab (L03 §6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, CostBadge, EmptyState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { confidenceTokens, formatSignals, sourceIcon } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);
  const intent = data?.intent ?? null;

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <div style={s.skeletonStack}>
          <Skeleton height={16} width="70%" />
          <Skeleton height={90} />
        </div>
      </Card>
    );
  }

  if (!intent) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <EmptyState
          icon="Target"
          title={t("intent.empty")}
          cta={t("intent.derive")}
          onCta={() => derive.mutate({ force: false })}
          ctaLoading={derive.isPending}
        />
      </Card>
    );
  }

  const conf = confidenceTokens(intent.confidence);

  return (
    <Card>
      <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
      <p style={s.quote}>&ldquo;{intent.intent}&rdquo;</p>

      <div style={s.badgeRow}>
        <Badge color={conf.color} bg={conf.bg} style={conf.outline ? s.outlineBadge : undefined}>
          {t(`intent.confidence.${intent.confidence}`)}
        </Badge>
      </div>
      {intent.confidence === "low" && intent.signals.length > 0 && (
        <p style={s.signalsLine}>
          {t("intent.inferredFrom", { signals: formatSignals(intent.signals) })}
        </p>
      )}

      <div style={s.grid}>
        <div>
          <div style={s.colHeader("var(--ok)")}>
            <Icon.Check size={13} />
            {t("intent.inScope")}
          </div>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={i} style={s.listItem("var(--text-secondary)")}>
                <span style={s.bullet("var(--ok)")}>·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={s.colHeader("var(--text-muted)")}>
            <Icon.X size={13} />
            {t("intent.outOfScope")}
          </div>
          {intent.out_of_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i} style={s.listItem("var(--text-muted)")}>
                  <span style={s.bullet("var(--text-muted)")}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p style={s.nothingStated}>{t("intent.nothingStated")}</p>
          )}
        </div>
      </div>

      <div style={s.divider} />

      <div style={s.sourcesHeader}>{t("intent.sources")}</div>
      <ul style={s.sourcesList}>
        {intent.sources.map((source, i) => {
          const SourceIcon = Icon[sourceIcon(source.kind)];
          return (
            <li key={i} style={s.sourceRow}>
              <SourceIcon size={13} style={s.sourceIcon} />
              <span className="mono" style={s.sourceRef}>
                {source.ref}
              </span>
              {source.status === "skipped" && source.reason && (
                <span style={s.sourceReason}>{t(`intent.skip.${source.reason}`)}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div style={s.footer}>
        {intent.model && (
          <span className="mono" style={s.footerModel}>
            {intent.model}
          </span>
        )}
        <CostBadge usd={intent.cost_usd} />
        {intent.stale && <span style={s.staleNote}>{t("intent.stale")}</span>}
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          loading={derive.isPending}
          onClick={() => derive.mutate({ force: true })}
          style={s.rederiveButton}
        >
          {derive.isPending ? t("intent.deriving") : t("intent.rederive")}
        </Button>
      </div>
    </Card>
  );
}
