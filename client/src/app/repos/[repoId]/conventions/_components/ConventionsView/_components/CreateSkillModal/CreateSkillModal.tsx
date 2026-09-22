/* CreateSkillModal — the merge: the accepted candidates become ONE editable
   draft skill, transcribed from the `conv-create` artboard.

   NOT the same component as the Skills Lab's CreateSkillModal
   (`app/skills/_components/SkillsListView/_components/CreateSkillModal`), even
   though the design gives both the same name. Two differences make merging them
   wrong rather than merely awkward:

   - there is NO provenance checkbox here, because provenance is not a choice on
     this path: `POST /repos/:id/conventions/skill` stamps `source: 'extracted'`
     itself (spec D8). Copying that component and deleting the checkbox would
     silently keep posting `source_is_external`, which this route does not
     accept and which would be a lie either way;
   - it has the merge banner, which is the whole point of the surface.

   The draft is computed CLIENT-SIDE on open (`./helpers`), so the user edits a
   draft rather than waiting on a round-trip, and nothing is written until
   `Create skill` — closing the modal leaves no row behind. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  CodeEditor,
  FormField,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { SKILL_TYPE_VALUES } from "@/lib/skill-type";
import { MODAL_WIDTH } from "../../constants";
import { conventionsToDraft } from "./helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoName,
  accepted,
  onClose,
}: {
  repoId: string;
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const create = useCreateSkillFromConventions();

  /* The draft is the form's INITIAL value, not derived state: from here on the
     fields are what the user typed, so recomputing it per render would undo
     their edits. The modal is mounted on open and unmounted on close, which is
     what makes a lazy initializer the right tool and an effect the wrong one. */
  const [draft] = React.useState(() => conventionsToDraft(repoName, accepted));
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(draft.enabled);
  const [body, setBody] = React.useState(draft.body);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const skill = await create.mutateAsync({
        repoId,
        name: trimmedName,
        description,
        type,
        enabled,
        body,
        // The provenance of the merge: which candidates it came from. `source`
        // is still never named by the client.
        convention_ids: accepted.map((c) => c.id),
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
      title={t("modal.title")}
      subtitle={draft.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {/* `v1` is a rich-text TAG, not a placeholder: next-intl interpolates
                `{v}` as a value and would silently render nothing (client
                INSIGHTS.md). The artboard sets it in mono, so it stays a tag. */}
            {t.rich("modal.footerNote", {
              v: (chunks) => (
                <span className="mono" style={s.footerVersion}>
                  {chunks}
                </span>
              ),
            })}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("modal.submitting") : t("modal.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Wrench size={15} style={s.bannerIcon} />
          <span style={s.bannerText}>
            {t.rich("modal.banner", {
              count: draft.count,
              repo: repoName,
              b: (chunks) => <b style={s.bannerStrong}>{chunks}</b>,
              code: (chunks) => (
                <span className="mono" style={s.bannerRepo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>

        <FormField label={t("modal.nameLabel")} required>
          <TextInput value={name} onChange={setName} mono aria-label={t("modal.nameLabel")} />
        </FormField>

        <FormField label={t("modal.descriptionLabel")}>
          <TextInput
            value={description}
            onChange={setDescription}
            aria-label={t("modal.descriptionLabel")}
          />
        </FormField>

        <div style={s.row}>
          <div style={s.rowCell}>
            <FormField label={t("modal.typeLabel")}>
              {/* Raw enum values, as the artboard draws them — the four labels
                  ARE the four values, so translating them would only duplicate
                  copy that cannot diverge. */}
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={[...SKILL_TYPE_VALUES]}
              />
            </FormField>
          </div>
          <div style={s.rowCell}>
            <FormField label={t("modal.enabledLabel")} hint={t("modal.enabledHint")}>
              <div style={s.toggleWrap}>
                <Toggle on={enabled} onChange={setEnabled} size={17} />
              </div>
            </FormField>
          </div>
        </div>

        <FormField label={t("modal.bodyLabel")} required hint={t("modal.bodyHint")}>
          <CodeEditor value={body} onChange={setBody} filename={`${trimmedName || draft.name}.md`} />
        </FormField>

        {create.isError && <div style={s.error}>{t("modal.error")}</div>}
      </div>
    </Modal>
  );
}
