/* FindingsPanel — severity filter + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, Toggle, EmptyState, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { countBySeverity, presentSeverities, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  // One severity at a time; null = no filter, the whole run is shown.
  const [selected, setSelected] = React.useState<string | null>(null);
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counted over every finding in the run, so a pill's number stays put while
  // the filters narrow the list below it.
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const severities = presentSeverities(counts);
  // A refetch can drop the last finding of the selected level; fall back to all.
  const sevFilter = selected && counts[selected] ? selected : null;
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, sevFilter),
    [findings, hideLow, sevFilter],
  );

  // A narrowing filter can leave the focused index past the end of the list.
  React.useEffect(() => setFocusIdx(0), [sevFilter, hideLow]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {severities.length > 0 && (
          <div style={s.sevChips}>
            {severities.map((sv, i) => (
              <React.Fragment key={sv}>
                {i > 0 && (
                  <span aria-hidden style={s.sevSeparator}>
                    ·
                  </span>
                )}
                <Chip
                  active={sevFilter === sv}
                  onClick={() => setSelected((cur) => (cur === sv ? null : sv))}
                  icon={SEV[sv as Severity].icon}
                  color={SEV[sv as Severity].c}
                >
                  {t("panel.severityPill", {
                    count: counts[sv]!,
                    label: t(`panel.severity.${sv}`),
                  })}
                </Chip>
              </React.Fragment>
            ))}
          </div>
        )}

        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
