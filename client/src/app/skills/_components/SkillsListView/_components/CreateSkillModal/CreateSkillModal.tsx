/* CreateSkillModal — the ONLY way a skill is created (spec D1).

   Transcribed from `screen_conv_conf.jsx`'s modal minus its convention-merge
   banner, which belongs to the Conventions extractor rather than here.

   Nothing is written until `Create skill` is pressed: pasting a body and then
   closing the modal leaves no row behind.

   PROVENANCE (D2) is the point of the lesson's trust segment. Ticking "this
   came from a third party" posts `source_is_external: true` and nothing else —
   the client never names a `source`, because a client that could would be able
   to call a third-party body `manual` and walk straight past the vetting step.
   A boolean can only pick between two server-defined outcomes. Ticking it also
   TAKES THE ENABLED TOGGLE AWAY rather than merely defaulting it off: a skill
   that could be switched on in the same gesture that admitted it is third party
   would make vetting decorative. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  CodeEditor,
  FormField,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_VALUES } from "@/lib/skill-type";
import { DEFAULT_SKILL_TYPE, FILENAME_FALLBACK, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [external, setExternal] = React.useState(false);

  /* Derived, not stored: a third-party skill is off, full stop, and unticking
     the box hands back whatever the author had chosen before. */
  const enabledEffective = external ? false : enabled;

  const trimmedName = name.trim();
  const filename = `${trimmedName || FILENAME_FALLBACK}.md`;
  const canSubmit = body.trim().length > 0 && !create.isPending;

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        ...(trimmedName ? { name: trimmedName } : {}),
        description,
        type,
        body,
        enabled: enabledEffective,
        source_is_external: external,
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      /* `create.isError` renders the message below the form. */
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("create.footerNote")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.submitting") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
          <TextInput
            value={name}
            onChange={setName}
            mono
            placeholder={t("file.namePlaceholder")}
            aria-label={t("file.nameLabel")}
          />
        </FormField>

        <FormField label={t("config.descriptionLabel")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("config.descriptionPlaceholder")}
            aria-label={t("config.descriptionLabel")}
          />
        </FormField>

        <div style={s.row}>
          <div style={s.rowCell}>
            <FormField label={t("create.typeLabel")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
          </div>
          <div style={s.rowCell}>
            <FormField label={t("create.enabledLabel")}>
              <div
                style={{ ...s.toggleWrap, ...(external ? s.toggleDisabled : null) }}
                aria-disabled={external || undefined}
              >
                <Toggle
                  on={enabledEffective}
                  onChange={external ? () => {} : setEnabled}
                  size={17}
                />
              </div>
            </FormField>
          </div>
        </div>

        <FormField label={t("file.bodyLabel")} required hint={t("file.bodyHint")}>
          <CodeEditor
            value={body}
            onChange={setBody}
            filename={filename}
            placeholder={t("file.bodyPlaceholder")}
            unsavedLabel={t("config.unsaved")}
            tokensLabel={t("config.tokens")}
          />
        </FormField>

        <div style={s.provenance}>
          <Checkbox checked={external} onChange={setExternal} label={t("create.externalLabel")} />
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>
            {t("create.externalHint")}
          </div>
        </div>

        {external && (
          <div style={s.notice} role="note">
            <Icon.AlertTriangle size={15} style={s.noticeIcon} />
            <span>{t("preview.untrustedNotice")}</span>
          </div>
        )}

        {create.isError && <div style={s.error}>{t("create.error")}</div>}
      </div>
    </Modal>
  );
}
