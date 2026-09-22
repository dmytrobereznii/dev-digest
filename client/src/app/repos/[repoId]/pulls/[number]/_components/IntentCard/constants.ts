import type { IconName } from "@devdigest/ui";
import type { IntentConfidence, IntentSourceKind } from "@devdigest/shared";

/**
 * Confidence badge tokens (D11 — the design has no confidence indicator; this
 * is built from existing CSS vars). `outline` marks the low-confidence case,
 * which gets a muted outline rather than a filled background.
 */
export const CONFIDENCE_TOKENS: Record<
  IntentConfidence,
  { color: string; bg: string; outline: boolean }
> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)", outline: false },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", outline: false },
  low: { color: "var(--text-muted)", bg: "transparent", outline: true },
};

/** Icon per IntentSource kind, for the SOURCES list row (D11). */
export const SOURCE_ICONS: Record<IntentSourceKind, IconName> = {
  issue: "MessageSquare",
  pull: "GitPullRequest",
  repo_file: "FileText",
  external: "ExternalLink",
};
