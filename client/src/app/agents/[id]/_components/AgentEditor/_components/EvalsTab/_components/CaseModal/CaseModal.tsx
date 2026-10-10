"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { NO_VALUE } from "@/components/eval/constants";
import { getDiffLineKind } from "./helpers";
import { s } from "./styles";

export interface CaseModalProps {
  evalCase: EvalCase;
  agentName: string;
  onClose: () => void;
}

/** Read-only view of one eval case: PR meta, expectation, input diff, last result. */
export function CaseModal({ evalCase, agentName, onClose }: CaseModalProps) {
  const t = useTranslations("eval.caseModal");
  const tTab = useTranslations("eval.evalsTab");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const exp = evalCase.expected_output;
  const result = evalCase.last_result;
  const lines = evalCase.input_diff.split("\n");

  return (
    <Modal width={760} title={t("title", { name: evalCase.name })} subtitle={agentName} onClose={onClose}>
      <div style={s.body}>
        <section>
          <div style={s.label}>{t("pullRequest")}</div>
          <div style={{ ...s.text, fontWeight: 600 }}>{evalCase.input_meta.pr_title}</div>
          {evalCase.input_meta.pr_description ? (
            <div style={s.text}>{evalCase.input_meta.pr_description}</div>
          ) : (
            <div style={s.muted}>{t("noDescription")}</div>
          )}
        </section>

        <section>
          <div style={s.label}>{t("expectation")}</div>
          <div style={s.text}>
            {exp.type === "must_find"
              ? `${exp.severity} · ${exp.category} · ${exp.title}`
              : tTab("mustNotFlag")}
          </div>
          <div className="mono" style={s.muted}>
            {exp.file}:{exp.start_line}-{exp.end_line}
          </div>
        </section>

        <section>
          <div style={s.label}>{t("input")}</div>
          <pre className="mono" style={s.diff}>
            {lines.map((line, i) => {
              const kind = getDiffLineKind(line);
              return (
                <span key={i} data-kind={kind} style={{ ...s.line, ...s[kind] }}>
                  {line === "" ? " " : line}
                </span>
              );
            })}
          </pre>
        </section>

        {result && (
          <div style={{ ...s.result, ...(result.pass ? s.pass : s.fail) }}>
            <strong>{result.pass ? t("lastRunPassed") : t("lastRunFailed")}</strong>
            {" · "}
            {t("resultSummary", {
              expected: exp.type === "must_find" ? 1 : 0,
              matched: result.matched,
              duration: (result.duration_ms / 1000).toFixed(1),
              cost: result.cost_usd == null ? NO_VALUE : `$${result.cost_usd.toFixed(4)}`,
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
