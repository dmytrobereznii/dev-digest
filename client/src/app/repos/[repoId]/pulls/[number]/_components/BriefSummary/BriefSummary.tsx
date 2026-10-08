/* BriefSummary — the summary block of the PR Brief (L05 spec 12): skeleton,
   read error, empty state, the stored brief, or the generating state. One
   control generates or refreshes. Model text renders as React text children
   only (NFR-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Skeleton, formatUsd } from "@devdigest/ui";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

export function BriefSummary({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const brief = data?.brief ?? null;
  const pending = generate.isPending || !!data?.generating;
  const errorMessage = generate.isError ? generate.error.message : null;

  if (isLoading) {
    return (
      <Card>
        <div style={s.skeletonStack}>
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="70%" />
        </div>
      </Card>
    );
  }

  if (isError && !data) {
    return (
      <Card>
        <div style={s.errorRow}>
          <p style={s.error}>{t("readError")}</p>
          <Button kind="ghost" size="sm" onClick={() => refetch()}>
            {t("retry")}
          </Button>
        </div>
      </Card>
    );
  }

  if (!brief) {
    return (
      <Card>
        <div style={s.row}>
          <div style={s.body}>
            {!pending && <p style={s.muted}>{t("unavailable")}</p>}
            {errorMessage && <p style={s.error}>{errorMessage}</p>}
          </div>
          <div style={s.controls}>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={pending}
              onClick={() => generate.mutate()}
            >
              {pending ? t("generating") : t("generate")}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={s.row}>
        <div style={s.body}>
          <p style={s.summary}>{brief.summary}</p>
          {brief.missing_inputs.length > 0 && (
            <div style={s.metaLine}>
              {t("missing.label", {
                inputs: brief.missing_inputs.map((m) => t(`missing.${m}`)).join(", "),
              })}
            </div>
          )}
          {brief.specs_used.length > 0 && (
            <div style={s.metaLine}>
              <span style={s.metaLabel}>{t("specsUsed")}</span>
              {brief.specs_used.map((path) => (
                <span key={path} className="mono" style={s.mono}>
                  {path}
                </span>
              ))}
            </div>
          )}
          <div style={s.metaLine}>
            <span className="mono" style={s.mono}>
              {t("modelCost", { model: brief.model, cost: formatUsd(brief.cost_usd) })}
            </span>
          </div>
          {errorMessage && <p style={s.error}>{errorMessage}</p>}
        </div>
        <div style={s.controls}>
          {brief.stale && <span style={{ ...s.metaLine, ...s.staleNote }}>{t("stale")}</span>}
          {pending ? (
            <Button kind="ghost" size="sm" icon="RefreshCw" disabled>
              {t("generating")}
            </Button>
          ) : (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              aria-label={t("refresh")}
              onClick={() => generate.mutate()}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
