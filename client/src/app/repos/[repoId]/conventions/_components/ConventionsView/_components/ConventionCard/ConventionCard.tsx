/* ConventionCard — one extracted house rule awaiting triage, transcribed from
   `screen_conv_conf.jsx`'s ConventionCard.

   Triage is two controls, not three states of one (spec D2): Accept TOGGLES
   between `pending` and `accepted`, Reject is terminal and sets `rejected`,
   which takes the row out of the list the page is served. That asymmetry is
   why both callbacks go through one `onSetStatus` carrying the status it wants
   rather than an `onToggle` / `onReject` pair — the parent runs one mutation.

   Edit is the third control and it works IN PLACE: the rule becomes a textarea
   and the category a select, on the card, with no navigation and no modal. The
   evidence and the confidence stay read-only while editing, because they are
   the gate's output — the snippet was matched character-by-character against
   the file the model was shown, and a retyped one would be a quote that appears
   nowhere in the repo. Rewording the rule that snippet supports is safe; the
   evidence still proves the same thing.

   Evidence is the point of the card: the snippet is what the server's gate
   actually located in the file, so it is shown verbatim and copyable. The
   artboard's Copy icon has no handler; it copies the SNIPPET, since the path is
   already selectable text beside it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, MonoLink, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionStatus,
} from "@devdigest/shared";
import { CONFIDENCE_OK_MIN, CONVENTION_CATEGORY_VALUES } from "../../constants";
import { s } from "./styles";

export function ConventionCard({
  c,
  onSetStatus,
  onEdit,
  pending,
  saving,
}: {
  c: ConventionCandidate;
  onSetStatus: (id: string, status: ConventionStatus) => void;
  /** Inline edit committed. Omit to render the card read-only. */
  onEdit?: (id: string, patch: { rule: string; category: ConventionCategory }) => void;
  /** A triage mutation for this card is in flight. */
  pending?: boolean;
  /** An edit save for this card is in flight. */
  saving?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(c.category ?? "other");

  const startEdit = () => {
    // Re-seed from the row each time: a cancelled edit must not linger.
    setRule(c.rule);
    setCategory(c.category ?? "other");
    setEditing(true);
  };

  const trimmed = rule.trim();
  const unchanged = trimmed === c.rule && category === (c.category ?? "other");

  const save = () => {
    if (trimmed === "" || unchanged) {
      setEditing(false);
      return;
    }
    onEdit?.(c.id, { rule: trimmed, category });
    setEditing(false);
  };

  const categoryOptions = CONVENTION_CATEGORY_VALUES.map((v) => ({
    value: v,
    label: t(`category.${v}`),
  }));

  return (
    <div style={s.card(c.accepted)}>
      <div style={s.row}>
        <div style={s.main}>
          {editing ? (
            <div style={s.editBox}>
              <div style={s.editCategory}>
                <SelectInput
                  value={category}
                  onChange={(v) => setCategory(v as ConventionCategory)}
                  options={categoryOptions}
                  ariaLabel={t("card.categoryLabel")}
                />
              </div>
              <Textarea
                value={rule}
                onChange={setRule}
                rows={2}
                ariaLabel={t("card.ruleLabel")}
              />
            </div>
          ) : (
            <div style={s.ruleRow}>
              {c.category && <span style={s.categoryPill}>{t(`category.${c.category}`)}</span>}
              <div style={s.rule}>{c.rule}</div>
            </div>
          )}

          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              <MonoLink>{c.evidence_path}</MonoLink>
              <button
                type="button"
                onClick={copySnippetOf(c.evidence_snippet)}
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
          {editing ? (
            <>
              <Button kind="primary" size="sm" icon="Check" full disabled={saving} onClick={save}>
                {saving ? t("card.saving") : t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" icon="X" full onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </>
          ) : (
            <>
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
              {onEdit && (
                <Button kind="ghost" size="sm" icon="Edit" full onClick={startEdit}>
                  {t("card.edit")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Optional-chained: jsdom and any non-secure origin have no clipboard, and a
   failed copy must not take the card down with it. */
function copySnippetOf(snippet: string) {
  return () => {
    void navigator.clipboard?.writeText(snippet);
  };
}
