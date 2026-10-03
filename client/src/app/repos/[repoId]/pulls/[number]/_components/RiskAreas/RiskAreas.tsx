/* RiskAreas — the "Risk areas" block drawn inside the Intent card (design
   screen_pr_detail.jsx BriefCard). Icon by kind, colour by severity, severity
   also as hidden text. Model strings render as plain text children (NFR-11);
   a file reference is text with a title, not a link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { DEFAULT_RISK_ICON, RISK_ICON, RISK_SEV } from "./constants";
import { s } from "./styles";

export function RiskAreas({ risks }: { risks: Risk[] }) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <p style={s.none}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => {
            const RiskIcon = Icon[RISK_ICON[risk.kind] ?? DEFAULT_RISK_ICON];
            return (
              <li key={i} style={s.item}>
                <RiskIcon size={14} style={s.icon(RISK_SEV[risk.severity])} />
                <div style={s.text}>
                  <span style={s.title}>
                    <span style={s.srOnly}>{t(`risk.severity.${risk.severity}`)}: </span>
                    {risk.title}
                  </span>
                  {risk.file_refs.length > 0 && (
                    <div style={s.refs}>
                      {risk.file_refs.map((ref, j) => (
                        <span key={j} className="mono" style={s.ref} title={ref}>
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
