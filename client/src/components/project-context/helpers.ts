import type { ProjectDocument } from "@devdigest/shared";

/** Heading of the section a skill's attached paths are serialized under. */
export const SPEC_LIST_HEADING = "## Project specifications";

/** Documents whose path contains `text`, ignoring case. Blank text keeps all. */
export function filterDocuments(docs: readonly ProjectDocument[], text: string): ProjectDocument[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [...docs];
  return docs.filter((d) => d.path.toLowerCase().includes(needle));
}

/** Token total of the documents whose path is in `checked`. */
export function sumTokens(docs: readonly ProjectDocument[], checked: readonly string[]): number {
  const on = new Set(checked);
  return docs.reduce((n, d) => (on.has(d.path) ? n + d.tokens : n), 0);
}

/** Attached paths that the repository's document list no longer contains. */
export function missingPaths(attached: readonly string[], docs: readonly ProjectDocument[]): string[] {
  const listed = new Set(docs.map((d) => d.path));
  return attached.filter((p) => !listed.has(p));
}

/** The heading and one `- <path>` line per attachment, in attach order. */
export function serializeSpecList(paths: readonly string[]): string {
  return [SPEC_LIST_HEADING, ...paths.map((p) => `- ${p}`)].join("\n");
}

/** Split a repo-relative path into its file name and directory ("" at the root). */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}
