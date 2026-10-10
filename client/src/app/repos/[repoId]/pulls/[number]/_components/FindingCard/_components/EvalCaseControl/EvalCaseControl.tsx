/* EvalCaseControl — "Turn into eval case" on a finding card. Disabled until the
   finding is accepted or dismissed; once a case exists it shows the created
   state and sends nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateEvalCase } from "@/lib/hooks/evals";
import { s } from "./styles";

export function EvalCaseControl({ f }: { f: FindingRecord }) {
  const t = useTranslations("prReview");
  const create = useCreateEvalCase();
  const hintId = React.useId();
  const created = !!f.eval_case_id;
  const decided = !!f.accepted_at || !!f.dismissed_at;
  const needsDecision = !created && !decided;

  return (
    <span style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon={created ? "Check" : "FlaskConical"}
        active={created}
        disabled={needsDecision}
        loading={create.isPending}
        aria-disabled={created || needsDecision ? true : undefined}
        aria-describedby={needsDecision ? hintId : undefined}
        onClick={created ? undefined : () => create.mutate(f.id)}
      >
        {created ? t("finding.evalCase.created") : t("finding.evalCase.action")}
      </Button>
      {needsDecision && (
        <span id={hintId} style={s.hint}>
          {t("finding.evalCase.needsDecision")}
        </span>
      )}
      {create.isError && (
        <span role="alert" style={s.error}>
          {create.error instanceof Error ? create.error.message : String(create.error)}
        </span>
      )}
    </span>
  );
}
