export type DiffLineKind = "added" | "removed" | "hunk" | "context";

/** Classifies one diff line by its prefix. */
export function getDiffLineKind(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "context";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  return "context";
}
