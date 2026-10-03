import type { ProjectDocumentType } from "@devdigest/shared";

/** Badge colours per document type, as theme variables. */
export const DOC_TYPE_COLORS: Record<ProjectDocumentType, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--bg-hover)" },
  docs: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  insights: { color: "var(--ok)", bg: "var(--bg-hover)" },
  other: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
