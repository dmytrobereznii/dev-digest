/* ConventionCard — one extracted house rule awaiting triage, transcribed from
   `screen_conv_conf.jsx`'s ConventionCard.

   The card is two controls, not three states of one (spec D2): Accept TOGGLES
   between `pending` and `accepted`, Reject is terminal and sets `rejected`,
   which takes the row out of the list the page is served. That asymmetry is
   why both callbacks go through one `onSetStatus` carrying the status it wants
   rather than an `onToggle` / `onReject` pair — the parent runs one mutation.

   Evidence is the point of the card: the snippet is what the server's gate
   actually located in the file, so it is shown verbatim and copyable. The
   artboard's Copy icon has no handler; it copies the SNIPPET, since the path is
   already selectable text beside it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { CONFIDENCE_OK_MIN } from "../../constants";
import { s } from "./styles";

export function ConventionCard({
  c,
  onSetStatus,
  pending,
}: {
  c: ConventionCandidate;
  onSetStatus: (id: string, status: ConventionStatus) => void;
  /** A triage mutation for this card is in flight. */
  pending?: boolean;
}) {
  const t = useTranslations("conventions");

  const copySnippet = () => {
    // Optional-chained: jsdom and any non-secure origin have no clipboard, and a
    // failed copy must not take the card down with it.
    void navigator.clipboard?.writeText(c.evidence_snippet);
  };

  return (
    <div style={s.card(c.accepted)}>
      <div style={s.row}>
        <div style={s.main}>
          <div style={s.rule}>{c.rule}</div>

          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              <MonoLink>{c.evidence_path}</MonoLink>
              <button
                type="button"
                onClick={copySnippet}
                aria-label={t("card.copyEvidence")}
                title={t("card.copyEvidence")}
                style={s.copyBtn}
              >
                <Icon.Copy size={12} />
              </button>
            </div>
            <pre className="mono" style={s.snippet}>
              {c.evidence_snippet}
            </pre>
          </div>

          <div style={s.confidence}>
            <span style={s.confidenceLabel}>{t("card.confidence")}</span>
            <div style={s.confidenceBar}>
              <ProgressBar
                value={c.confidence * 100}
                height={5}
                color={c.confidence >= CONFIDENCE_OK_MIN ? "var(--ok)" : "var(--warn)"}
              />
            </div>
            <span className="mono tnum" style={s.confidencePct}>
              {Math.round(c.confidence * 100)}%
            </span>
          </div>
        </div>

        <div style={s.actions}>
          {c.accepted ? (
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              full
              disabled={pending}
              onClick={() => onSetStatus(c.id, "pending")}
            >
              {pending ? t("card.accepting") : t("card.accepted")}
            </Button>
          ) : (
            <Button
              kind="secondary"
              size="sm"
              icon="Plus"
              full
              disabled={pending}
              onClick={() => onSetStatus(c.id, "accepted")}
            >
              {pending ? t("card.accepting") : t("card.accept")}
            </Button>
          )}
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            full
            disabled={pending}
            onClick={() => onSetStatus(c.id, "rejected")}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
