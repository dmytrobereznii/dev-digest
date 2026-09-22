/* helpers.ts — the merge format, ported from the design's `conventionsToDraft`
   + `slugifyRule` (`screen_conv_conf.jsx:4-14`).

   This is a COPY-EXACT transcription, not a paraphrase: the body it produces is
   the text that ends up in a model's prompt, and the server writes the same
   format in `modules/conventions/helpers.ts#buildSkillDraft`. Any drift between
   the two would show up as a skill whose body changes the moment it is saved.

   Details that are easy to lose, all of them the design's: every rule gets a
   TRAILING PERIOD appended, the repo name in the preamble is the BARE name
   (`payments-api`, not `owner/name`), and the slug keeps the first four
   non-stop words. */
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { DEFAULT_SKILL_TYPE } from "../../constants";

/**
 * The design's stop-word list, verbatim. It is what turns "Always use
 * async/await instead of .then() chains" into `async-await-then-chains` — a
 * heading a reviewer can scan, rather than the whole sentence.
 */
const STOP_WORDS = [
  "always",
  "use",
  "the",
  "a",
  "an",
  "to",
  "of",
  "instead",
  "must",
  "should",
  "all",
  "in",
  "via",
  "through",
  "are",
  "is",
  "and",
  "with",
  "for",
];

/** Lowercase, strip backticks, collapse to dashes, drop stop words, keep four. */
export function slugifyRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter((w) => w && !STOP_WORDS.includes(w))
    .slice(0, 4)
    .join("-");
}

/** The editable draft the modal opens on — never persisted as-is. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  /** How many candidates were merged — the banner's N. */
  count: number;
}

/**
 * ONE draft from the WHOLE accepted set (spec D1). The `single` branch changes
 * only the NAMING — one accepted rule names the skill after that rule instead
 * of after the repo — it does not switch to one skill per rule.
 */
export function conventionsToDraft(
  repoName: string,
  accepted: ConventionCandidate[],
): SkillDraft {
  const single = accepted.length === 1;
  const first = accepted[0];
  const name = single && first ? slugifyRule(first.rule) : `${repoName}-conventions`;
  const description =
    single && first
      ? first.rule
      : `${accepted.length} house conventions extracted from ${repoName}`;
  const sections = accepted
    .map(
      (c) =>
        `## ${slugifyRule(c.rule)}\n${c.rule}.\n\n` +
        `Detected in \`${c.evidence_path}\`:\n\n` +
        "```\n" +
        c.evidence_snippet +
        "\n```",
    )
    .join("\n\n");
  const body =
    `# ${name}\n\n` +
    `House conventions for \`${repoName}\`. Flag changes that violate any rule ` +
    `below and cite the offending \`file:line\`.\n\n` +
    sections;
  return {
    name,
    description,
    type: DEFAULT_SKILL_TYPE,
    enabled: true,
    body,
    count: accepted.length,
  };
}
