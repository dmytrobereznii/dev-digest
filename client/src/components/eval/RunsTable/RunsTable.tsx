"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { EvalRunSummary } from "@devdigest/shared";
import { METRIC_COLOR, NO_VALUE } from "../constants";
import { formatPct, formatRanAt, toPct } from "../helpers";
import { s } from "./styles";

export interface RunsTableSelection {
  selectedIds: string[];
  /** Once this many are selected the other checkboxes are disabled. */
  max: number;
  onToggle: (runId: string) => void;
}

export interface RunsTableProps {
  runs: EvalRunSummary[];
  /** Selection checkboxes on completed rows; none when omitted. */
  selection?: RunsTableSelection;
  /** An extra first column, e.g. the agent name on the all-agents table. */
  leading?: { header: string; render: (run: EvalRunSummary) => ReactNode };
  /** The Cost column; on by default. */
  showCost?: boolean;
}

function MetricCell({ value, color }: { value: number | null; color: string }) {
  const pct = toPct(value);
  if (pct == null) return <span>{NO_VALUE}</span>;
  return (
    <div style={s.metric}>
      <div style={s.track} aria-hidden>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span>{formatPct(value)}</span>
    </div>
  );
}

/** A table of eval runs, shared by the Evals tab and the `/eval` routes. */
export function RunsTable({ runs, selection, leading, showCost = true }: RunsTableProps) {
  const t = useTranslations("eval.runs");
  const full = selection ? selection.selectedIds.length >= selection.max : false;

  return (
    <table style={s.table}>
      <thead>
        <tr>
          {selection && <th style={s.th} />}
          {leading && <th style={s.th}>{leading.header}</th>}
          <th style={s.th}>{t("columns.ranAt")}</th>
          <th style={s.th}>{t("columns.version")}</th>
          <th style={s.th}>{t("columns.recall")}</th>
          <th style={s.th}>{t("columns.precision")}</th>
          <th style={s.th}>{t("columns.citation")}</th>
          <th style={s.th}>{t("columns.pass")}</th>
          {showCost && <th style={s.th}>{t("columns.cost")}</th>}
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const settled = run.status === "completed";
          const checked = selection?.selectedIds.includes(run.id) ?? false;
          const ranAt = formatRanAt(run.ran_at);
          return (
            <tr key={run.id}>
              {selection && (
                <td style={s.td}>
                  {settled && (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={full && !checked}
                      onChange={() => selection.onToggle(run.id)}
                      aria-label={t("selectRun", { version: run.agent_version, ranAt })}
                    />
                  )}
                </td>
              )}
              {leading && <td style={s.td}>{leading.render(run)}</td>}
              <td style={s.td}>{ranAt}</td>
              <td style={s.td}>v{run.agent_version}</td>
              {settled ? (
                <>
                  <td style={s.td}><MetricCell value={run.recall} color={METRIC_COLOR.recall} /></td>
                  <td style={s.td}><MetricCell value={run.precision} color={METRIC_COLOR.precision} /></td>
                  <td style={s.td}>
                    <MetricCell value={run.citation_accuracy} color={METRIC_COLOR.citation} />
                  </td>
                </>
              ) : (
                <td
                  style={{ ...s.td, ...(run.status === "failed" ? s.failed : s.status) }}
                  colSpan={3}
                >
                  {t(`status.${run.status}`)}
                </td>
              )}
              <td style={s.td}>
                {settled && run.traces_passed != null
                  ? `${run.traces_passed}/${run.traces_total}`
                  : NO_VALUE}
              </td>
              {showCost && (
                <td style={s.td}>
                  {run.cost_usd == null ? NO_VALUE : `$${run.cost_usd.toFixed(4)}`}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
