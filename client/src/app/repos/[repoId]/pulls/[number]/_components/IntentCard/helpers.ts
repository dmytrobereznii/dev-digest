import type { IconName } from "@devdigest/ui";
import type { IntentConfidence, IntentSignal, IntentSourceKind } from "@devdigest/shared";
import { CONFIDENCE_TOKENS, SOURCE_ICONS } from "./constants";

/** Badge color/background + outline flag for a confidence level (D11). */
export function confidenceTokens(confidence: IntentConfidence) {
  return CONFIDENCE_TOKENS[confidence];
}

/** Icon for one IntentSource's kind, in the SOURCES list. */
export function sourceIcon(kind: IntentSourceKind): IconName {
  return SOURCE_ICONS[kind];
}

/**
 * "title, commits, branch" — the low-confidence hint line naming which
 * signals fed the derivation (D11). `IntentSignal` values are already plain
 * words with underscores, so no i18n map is needed beyond this formatting.
 */
export function formatSignals(signals: IntentSignal[]): string {
  return signals.map((signal) => signal.replace(/_/g, " ")).join(", ");
}
