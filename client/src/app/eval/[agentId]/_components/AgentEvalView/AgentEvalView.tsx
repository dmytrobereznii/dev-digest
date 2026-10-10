"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useAgentEvals, useRunEvals } from "@/lib/hooks/evals";
import { MetricTile } from "@/components/eval/MetricTile";
import { RunsTable } from "@/components/eval/RunsTable";
import { METRIC_COLOR } from "@/components/eval/constants";
import { definedPoints, formatPct, pointDelta } from "@/components/eval/helpers";
import { MAX_COMPARE, NOT_FOUND_STATUSES } from "./constants";
import { CompareModal } from "./_components/CompareModal";
import { TrendChart } from "./_components/TrendChart";
import { s } from "./styles";

export interface AgentEvalViewProps {
  agentId: string;
}

/** One agent's eval view: metric cards, trend, recent runs, run control and Compare. */
export function AgentEvalView({ agentId }: AgentEvalViewProps) {
  const t = useTranslations("eval");
  const { data, isLoading, error, refetch } = useAgentEvals(agentId);
  const run = useRunEvals(agentId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const allAgents = (
    <Link href="/eval" style={s.back}>
      <Icon.ChevronLeft size={14} />
      {t("agentView.allAgents")}
    </Link>
  );

  if (error instanceof ApiError && NOT_FOUND_STATUSES.includes(error.status)) {
    return (
      <div style={s.notFound}>
        <p>{t("agentView.notFound")}</p>
        {allAgents}
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        fullScreen
        title={error instanceof ApiError ? error.message : String(error.message)}
        onRetry={() => refetch()}
      />
    );
  }
  if (isLoading || !data) {
    return (
      <div style={s.page}>
        <Skeleton />
      </div>
    );
  }

  const { agent, runs, trend } = data;
  const newest = runs[0];
  const running = newest?.status === "running" || run.isPending;
  const runDisabled = data.cases_total === 0 || running;
  const failedError = newest?.status === "failed" ? newest.error : null;
  const runError = failedError ?? (run.error ? run.error.message : null);

  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const cards = [
    { key: "recall", label: t("metrics.recall"), field: "recall" },
    { key: "precision", label: t("metrics.precision"), field: "precision" },
    { key: "citation", label: t("metrics.citationAccuracy"), field: "citation_accuracy" },
  ] as const;

  const toggle = (runId: string) =>
    setSelectedIds((ids) =>
      ids.includes(runId)
        ? ids.filter((id) => id !== runId)
        : ids.length < MAX_COMPARE
          ? [...ids, runId]
          : ids,
    );

  return (
    <div style={s.page}>
      {allAgents}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.h1}>{agent.name}</h1>
          <div style={s.meta}>
            {t("agentView.meta", {
              model: agent.model,
              runs: data.runs_total,
              cases: data.cases_total,
            })}
          </div>
        </div>
        <div style={s.controls}>
          {runError && (
            <span style={s.error} role="alert">
              {failedError ? t("agentView.runError", { error: runError }) : runError}
            </span>
          )}
          <Button kind="primary" icon="Play" disabled={runDisabled} onClick={() => run.mutate()}>
            {running ? t("agentView.running") : t("agentView.runEval")}
          </Button>
        </div>
      </div>

      <div style={s.tiles}>
        {cards.map((c) => (
          <MetricTile
            key={c.key}
            label={c.label}
            value={latest && latest[c.field] != null ? formatPct(latest[c.field]) : null}
            delta={latest && previous ? pointDelta(latest[c.field], previous[c.field]) : null}
            color={METRIC_COLOR[c.key]}
            trend={definedPoints(trend.map((p) => p[c.field]))}
          />
        ))}
      </div>

      <section style={s.card}>
        <div style={s.cardTitle}>
          <Icon.TrendingUp size={14} />
          {t("agentView.metricTrend")}
        </div>
        {trend.length >= 2 ? (
          <TrendChart points={trend} />
        ) : (
          <p style={s.placeholder}>{t("agentView.trendPlaceholder")}</p>
        )}
      </section>

      <section>
        <div style={s.runsHead}>
          <div style={s.cardTitle}>
            <Icon.History size={14} />
            {t("runs.title")}
            <span style={s.selected}>{t("runs.selected", { count: selectedIds.length })}</span>
          </div>
          <Button
            kind="primary"
            disabled={selectedIds.length !== MAX_COMPARE}
            onClick={() => setComparing(true)}
          >
            {t("agentView.compare")}
          </Button>
        </div>
        <RunsTable
          runs={runs}
          selection={{ selectedIds, max: MAX_COMPARE, onToggle: toggle }}
        />
      </section>

      {comparing && selectedIds.length === MAX_COMPARE && (
        <CompareModal
          runIds={[selectedIds[0]!, selectedIds[1]!]}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
