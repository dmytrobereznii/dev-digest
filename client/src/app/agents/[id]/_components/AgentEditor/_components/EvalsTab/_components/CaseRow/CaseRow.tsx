"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { s } from "./styles";

export interface CaseRowProps {
  evalCase: EvalCase;
  /** True while a run is running: deleting is not allowed then. */
  deleteDisabled: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

/** One eval case: status icon, name, last-result line, expectation tag, delete control. */
export function CaseRow({ evalCase, deleteDisabled, onOpen, onDelete }: CaseRowProps) {
  const t = useTranslations("eval.evalsTab");
  const result = evalCase.last_result;
  const exp = evalCase.expected_output;
  const status = result ? (result.pass ? "pass" : "fail") : "never";

  return (
    <div style={s.row} onClick={onOpen}>
      <span style={s.icon} data-status={status} aria-hidden>
        {status === "pass" && <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} />}
        {status === "fail" && <Icon.XCircle size={18} style={{ color: "var(--crit)" }} />}
        {status === "never" && <Icon.Dot size={18} style={{ color: "var(--text-muted)" }} />}
      </span>
      <div style={s.text}>
        <button type="button" style={s.name}>
          {evalCase.name}
        </button>
        <div style={s.sub}>
          {result ? t("expectedGot", { type: result.expectation_type, n: result.matched }) : t("neverRun")}
        </div>
      </div>
      <span style={s.tag}>
        {exp.type === "must_find" ? `${exp.severity} · ${exp.category}` : t("mustNotFlag")}
      </span>
      <button
        type="button"
        style={deleteDisabled ? { ...s.del, opacity: 0.4, cursor: "not-allowed" } : s.del}
        aria-label={t("deleteCase", { name: evalCase.name })}
        title={t("deleteCase", { name: evalCase.name })}
        disabled={deleteDisabled}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Icon.Trash size={16} />
      </button>
    </div>
  );
}
