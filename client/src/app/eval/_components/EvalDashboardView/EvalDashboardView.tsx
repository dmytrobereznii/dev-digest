/* EvalDashboardView — /eval, the all-agents Eval Dashboard (design `02`).
   Four body states: skeleton while loading, an error with Retry, an empty
   state when no agent has a case or a run, and the agent rows plus the
   "Recent eval runs · all agents" table. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RunsTable } from "@/components/eval/RunsTable";
import { METRIC_COLOR } from "@/components/eval/constants";
import { definedPoints, formatPct, formatRanAt } from "@/components/eval/helpers";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { SKELETON_ROWS, SKELETON_ROW_HEIGHT } from "./constants";
import { s } from "./styles";

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={s.metric}>
      <div style={s.metricLabel}>{label}</div>
      <div style={{ ...s.metricValue, color }}>{value}</div>
    </div>
  );
}

function AgentRow({ agent, onOpen }: { agent: EvalDashboardAgent; onOpen: () => void }) {
  const t = useTranslations("eval");
  const run = agent.latest_run;
  const trend = definedPoints(agent.recall_trend);
  const passed = run?.traces_passed;
  return (
    <button type="button" style={s.row} onClick={onOpen} aria-label={t("dashboard.agentRow", { name: agent.name })}>
      <div style={s.main}>
        <div style={s.nameLine}>
          <span style={s.name}>{agent.name}</span>
          <span style={s.model}>{agent.model}</span>
        </div>
        <div style={s.meta}>
          {run
            ? [
                `v${run.agent_version}`,
                formatRanAt(run.ran_at),
                passed != null ? t("dashboard.passOf", { passed, total: run.traces_total }) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : t("dashboard.noRuns")}
        </div>
      </div>
      {run && trend.length > 0 && (
        <div style={s.spark}>
          <Sparkline data={trend} color={METRIC_COLOR.recall} />
        </div>
      )}
      <Metric label={t("runs.columns.recall")} value={formatPct(run?.recall)} color={METRIC_COLOR.recall} />
      <Metric label={t("runs.columns.precision")} value={formatPct(run?.precision)} color={METRIC_COLOR.precision} />
      <Metric label={t("runs.columns.citation")} value={formatPct(run?.citation_accuracy)} color={METRIC_COLOR.citation} />
    </button>
  );
}

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const crumb = [{ label: useTranslations("agents")("list.breadcrumbLab") }, { label: t("dashboard.title") }];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={26} width={280} />
          <div style={s.stack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={SKELETON_ROW_HEIGHT} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState body={t("dashboard.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  const empty = data.agents.length === 0 && data.recent_runs.length === 0;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div>
          <h1 style={s.title}>{t("dashboard.title")}</h1>
          <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
        </div>
        {empty ? (
          <EmptyState icon="Gauge" title={t("dashboard.title")} body={t("dashboard.empty")} />
        ) : (
          <>
            <div style={s.stack}>
              {data.agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} onOpen={() => router.push(`/eval/${agent.id}`)} />
              ))}
            </div>
            <div style={s.sectionLabel}>{t("dashboard.recentRuns")}</div>
            <RunsTable
              runs={data.recent_runs}
              showCost={false}
              leading={{
                header: t("runs.columns.agent"),
                render: (run) => (
                  <span style={s.agentName}>
                    {data.recent_runs.find((r) => r.id === run.id)?.agent_name}
                  </span>
                ),
              }}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
