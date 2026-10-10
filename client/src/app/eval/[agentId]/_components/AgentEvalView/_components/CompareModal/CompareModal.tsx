"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalRunDetail } from "@devdigest/shared";
import { useEvalRun } from "@/lib/hooks/evals";
import { ApiError } from "@/lib/api";
import { METRIC_COLOR, NO_VALUE } from "@/components/eval/constants";
import { formatPct, pointDelta } from "@/components/eval/helpers";
import { caseSetDifference, diffLines, formatUsd } from "./helpers";
import { s } from "./styles";

export interface CompareModalProps {
  /** The two selected run ids, in any order. */
  runIds: [string, string];
  onClose: () => void;
}

const arrowColor = (n: number) =>
  n > 0 ? "var(--ok)" : n < 0 ? "var(--crit)" : "var(--text-muted)";

function CompareTile({
  label,
  older,
  newer,
  delta,
  color,
}: {
  label: string;
  older: string | null;
  newer: string | null;
  /** Pre-rendered delta text, or null to show none. */
  delta: { text: string; sign: number } | null;
  color?: string;
}) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileRow}>
        <span style={s.older}>{older ?? NO_VALUE}</span>
        <span aria-hidden>→</span>
        <span style={{ ...s.newer, color }}>{newer ?? NO_VALUE}</span>
        {delta && <span style={{ ...s.delta, color: arrowColor(delta.sign) }}>{delta.text}</span>}
      </div>
    </div>
  );
}

/** Two completed runs side by side: metric tiles, models, pass counts and the prompt diff. */
export function CompareModal({ runIds, onClose }: CompareModalProps) {
  const t = useTranslations("eval.compare");
  const tm = useTranslations("eval.metrics");
  const first = useEvalRun(runIds[0]);
  const second = useEvalRun(runIds[1]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button onClick={onClose}>{t("close")}</Button>
    </div>
  );

  const runA = first.data;
  const runB = second.data;
  const failure = first.error ?? second.error;

  if (!runA || !runB) {
    return (
      <Modal width={820} footer={footer}>
        {failure ? (
          <div style={s.error}>
            {failure instanceof ApiError ? failure.message : String(failure.message)}
          </div>
        ) : (
          <div style={s.state}>{t("loading")}</div>
        )}
      </Modal>
    );
  }

  const [older, newer]: [EvalRunDetail, EvalRunDetail] =
    Date.parse(runA.ran_at) <= Date.parse(runB.ran_at) ? [runA, runB] : [runB, runA];
  const vOld = `v${older.agent_version}`;
  const vNew = `v${newer.agent_version}`;

  const pointDeltaText = (n: number | null) =>
    n == null
      ? null
      : {
          text: tm("delta", { direction: n > 0 ? "up" : n < 0 ? "down" : "flat", n: Math.abs(n) }),
          sign: n,
        };

  const costDelta =
    older.cost_usd == null || newer.cost_usd == null
      ? null
      : (() => {
          const d = newer.cost_usd - older.cost_usd;
          const text = d === 0 ? "0" : `${d > 0 ? "▲" : "▼"} ${formatUsd(Math.abs(d))}`;
          return { text, sign: d };
        })();

  const diff = older.system_prompt === newer.system_prompt ? null : diffLines(older.system_prompt, newer.system_prompt);
  const sets = caseSetDifference(
    older.results.map((r) => r.case_id),
    newer.results.map((r) => r.case_id),
  );
  const setsDiffer = sets.onlyOlder > 0 || sets.onlyNewer > 0;

  const metrics = [
    { key: "recall", label: tm("recall"), field: "recall" },
    { key: "precision", label: tm("precision"), field: "precision" },
    { key: "citation", label: tm("citationAccuracy"), field: "citation_accuracy" },
  ] as const;

  return (
    <Modal width={820} title={t("title", { older: vOld, newer: vNew })} footer={footer}>
      <div style={s.body}>
        {setsDiffer && (
          <div style={s.notice} role="note">
            {t("caseSetNotice", {
              onlyOlder: sets.onlyOlder,
              onlyNewer: sets.onlyNewer,
              older: vOld,
              newer: vNew,
            })}
          </div>
        )}
        <div style={s.tiles}>
          {metrics.map((m) => (
            <CompareTile
              key={m.key}
              label={m.label}
              older={older[m.field] == null ? null : formatPct(older[m.field])}
              newer={newer[m.field] == null ? null : formatPct(newer[m.field])}
              delta={pointDeltaText(pointDelta(newer[m.field], older[m.field]))}
              color={METRIC_COLOR[m.key]}
            />
          ))}
          <CompareTile
            label={tm("cost")}
            older={older.cost_usd == null ? null : formatUsd(older.cost_usd)}
            newer={newer.cost_usd == null ? null : formatUsd(newer.cost_usd)}
            delta={costDelta}
          />
        </div>
        <div style={s.facts}>
          {older.model !== newer.model && (
            <div>{t("models", { older: older.model, newer: newer.model })}</div>
          )}
          {[older, newer].map((run, i) => (
            <div key={run.id}>
              {t("passedOf", {
                version: i === 0 ? vOld : vNew,
                passed: run.traces_passed ?? NO_VALUE,
                total: run.traces_total,
              })}
            </div>
          ))}
        </div>
        {diff ? (
          <div>
            <div style={s.sectionTitle}>{t("promptDiff")}</div>
            <div style={s.legend}>
              <span>
                <span style={s.swatchRemoved} aria-hidden />
                {t("removedIn", { version: vOld })}
              </span>
              <span>
                <span style={s.swatchAdded} aria-hidden />
                {t("addedIn", { version: vNew })}
              </span>
            </div>
            <div style={s.diff}>
              {diff.map((line, i) => (
                <div
                  key={i}
                  data-diff={line.kind}
                  style={{
                    ...s.line,
                    ...(line.kind === "removed" ? s.removed : line.kind === "added" ? s.added : {}),
                  }}
                >
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={s.facts}>{t("promptUnchanged")}</div>
        )}
      </div>
    </Modal>
  );
}
