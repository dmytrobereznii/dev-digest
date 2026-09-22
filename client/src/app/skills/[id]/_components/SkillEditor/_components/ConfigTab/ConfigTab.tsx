/* ConfigTab — the skill's editable metadata plus its body, transcribed from
   screen_skills.jsx:92.

   The body is the feature: everything else on this form is metadata, and only
   a body change versions the skill (the server decides; the `v{n+1}` hint is
   shown only when the body is dirty so the two never disagree). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  CodeEditor,
  FormField,
  Icon,
  SelectInput,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { DeleteSkillModal } from "@/app/skills/_components/DeleteSkillModal";
import { SKILL_TYPE_VALUES } from "@/lib/skill-type";
import { BODY_FILE_EXT, UNNAMED_FILE } from "./constants";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [note, setNote] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  const reset = React.useCallback(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
    setNote("");
  }, [skill]);

  // Reset the local form when the rail switches skills — and ONLY then. A
  // background refetch must not overwrite what is being typed.
  React.useEffect(() => {
    reset();
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only a body change versions the skill — mirrors the server's isBodyChange.
  const dirtyBody = body !== skill.body;

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const trimmedNote = note.trim();

  const save = () =>
    update.mutate({
      id: skill.id,
      patch: { name, description, type, body, enabled },
      ...(trimmedNote ? { note: trimmedNote } : {}),
    });


  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.heading")}</h2>
        <Badge color="var(--text-secondary)" icon="GitCommit">
          {t("config.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.nameLabel")} hint={t("config.nameHint")} required>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} mono />
      </FormField>

      <FormField label={t("config.descriptionLabel")} hint={t("config.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("config.typeLabel")} hint={t("config.typeHint")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      {/* A body that came from outside is stored as data, not instructions. */}
      {skill.source !== "manual" && (
        <div style={s.untrusted}>
          <Icon.Shield size={15} style={s.untrustedIcon} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <FormField label={t("config.bodyLabel")} hint={t("config.bodyHint")} required>
        <CodeEditor
          value={body}
          onChange={setBody}
          filename={`${name || UNNAMED_FILE}${BODY_FILE_EXT}`}
          dirty={dirtyBody}
          placeholder={t("config.bodyPlaceholder")}
          unsavedLabel={t("config.unsaved")}
          tokensLabel={t("config.tokens")}
        />
      </FormField>

      <FormField label={t("config.noteLabel")} hint={t("config.noteHint")}>
        <TextInput value={note} onChange={setNote} placeholder={t("config.notePlaceholder")} />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={reset} disabled={update.isPending}>
          {t("config.cancel")}
        </Button>
        {update.isError && <span style={s.saveError}>{t("config.saveError")}</span>}
        {/* Metadata-only saves do not version, so the hint only shows when the
            body actually changed. */}
        {dirtyBody && (
          <span style={s.saveHint}>{t("config.saveHint", { n: skill.version + 1 })}</span>
        )}
      </div>

      <div style={s.danger}>
        <div style={s.dangerRow}>
          <div style={{ flex: 1 }}>
            <div style={s.dangerTitle}>{t("danger.title")}</div>
            <div style={s.dangerBody}>{t("danger.body")}</div>
          </div>
          <Button kind="danger" size="sm" icon="Trash" onClick={() => setConfirming(true)}>
            {t("danger.action")}
          </Button>
        </div>
      </div>

      {confirming && (
        <DeleteSkillModal
          skill={skill}
          onClose={() => setConfirming(false)}
          onDeleted={() => router.push("/skills")}
        />
      )}
    </div>
  );
}
