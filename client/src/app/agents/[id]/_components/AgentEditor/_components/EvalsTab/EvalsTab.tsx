"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCase } from "@devdigest/shared";
import { MetricTile } from "@/components/eval/MetricTile";
import { RunsTable } from "@/components/eval/RunsTable";
import { METRIC_COLOR } from "@/components/eval/constants";
import { definedPoints, formatPct, pointDelta } from "@/components/eval/helpers";
import { useAgentEvals, useRunEvals } from "@/lib/hooks/evals";
import { CaseRow } from "./_components/CaseRow";
import { CaseModal } from "./_components/CaseModal";
import { DeleteCaseDialog } from "./_components/DeleteCaseDialog";
import { RECENT_RUNS, getCompletedRuns } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const evals = useAgentEvals(agent.id);
  const run = useRunEvals(agent.id);
  const [viewing, setViewing] = useState<EvalCase | null>(null);
  const [deleting, setDeleting] = useState<EvalCase | null>(null);

  if (evals.isLoading) {
    return (
      <div style={s.wrap} data-testid="evals-skeleton">
        <Skeleton height={80} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }
  if (evals.isError || !evals.data) {
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("evalsTab.loadError")}
          body={evals.error instanceof Error ? evals.error.message : undefined}
          onRetry={() => evals.refetch()}
        />
      </div>
    );
  }

  const data = evals.data;
  const { latest, previous } = getCompletedRuns(data.runs);
  const newest = data.runs[0] ?? null;
  const running = newest?.status === "running" || run.isPending;
  const passed = data.cases.filter((c) => c.last_result?.pass).length;
  const trend = (pick: "recall" | "precision" | "citation_accuracy") =>
    definedPoints(data.trend.map((p) => p[pick]));
  const delta = (pick: "recall" | "precision" | "citation_accuracy") =>
    latest && previous ? pointDelta(latest[pick], previous[pick]) : null;
  const runError =
    newest?.status === "failed" && newest.error
      ? newest.error
      : run.error instanceof Error
        ? run.error.message
        : null;

  return (
    <div style={s.wrap}>
      <div>
        <div style={s.header}>
          <span style={s.title}>{t("evalsTab.title")}</span>
          <Link href={`/eval/${agent.id}`} style={s.link}>
            {t("evalsTab.viewDashboard")} →
          </Link>
        </div>
      </div>

      <div style={s.tiles}>
        <MetricTile
          label={t("metrics.recall")}
          value={latest ? formatPct(latest.recall) : null}
          delta={delta("recall")}
          color={METRIC_COLOR.recall}
          trend={trend("recall")}
        />
        <MetricTile
          label={t("metrics.precision")}
          value={latest ? formatPct(latest.precision) : null}
          delta={delta("precision")}
          color={METRIC_COLOR.precision}
          trend={trend("precision")}
        />
        <MetricTile
          label={t("metrics.citationAccuracy")}
          value={latest ? formatPct(latest.citation_accuracy) : null}
          delta={delta("citation_accuracy")}
          color={METRIC_COLOR.citation}
          trend={trend("citation_accuracy")}
        />
        <MetricTile
          label={t("metrics.tracesPassed")}
          value={latest && latest.traces_passed != null ? `${latest.traces_passed}/${latest.traces_total}` : null}
          color="var(--text)"
        />
      </div>

      <div style={s.casesHeader}>
        <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
        <Badge color="var(--ok)">
          {t("evalsTab.passing", { passed, total: data.cases_total })}
        </Badge>
        <div style={s.controls}>
          {runError && (
            <span role="alert" style={s.runError}>
              {t("evalsTab.runError", { error: runError })}
            </span>
          )}
          <Button
            kind="secondary"
            icon="Play"
            disabled={running || data.cases.length === 0}
            onClick={() => run.mutate()}
          >
            {running ? t("evalsTab.running") : t("evalsTab.runAll")}
          </Button>
        </div>
      </div>

      {data.cases.length === 0 ? (
        <div style={s.empty}>{t("evalsTab.empty")}</div>
      ) : (
        <div style={s.list}>
          {data.cases.map((c) => (
            <CaseRow
              key={c.id}
              evalCase={c}
              deleteDisabled={running}
              onOpen={() => setViewing(c)}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </div>
      )}

      <div style={s.recent}>
        <h2 style={s.h2}>{t("runs.title")}</h2>
        {data.runs.length === 0 ? (
          <div style={s.muted}>{t("runs.empty")}</div>
        ) : (
          <RunsTable runs={data.runs.slice(0, RECENT_RUNS)} />
        )}
      </div>

      {viewing && (
        <CaseModal evalCase={viewing} agentName={agent.name} onClose={() => setViewing(null)} />
      )}
      {deleting && (
        <DeleteCaseDialog agentId={agent.id} evalCase={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
