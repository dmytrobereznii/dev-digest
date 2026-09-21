import type { CSSProperties } from "react";
import { CARD_ACTIONS_WIDTH, CONFIDENCE_BAR_WIDTH } from "../../constants";

/** Co-located styles for ConventionCard. */
export const s = {
  /* The left border IS the accepted state in the artboard — 3px of `--ok`
     against 1px of `--border` everywhere else — so it is a function, not a
     constant. */
  card: (accepted: boolean) =>
    ({
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border)"}`,
      borderRadius: 9,
      background: "var(--bg-elevated)",
      padding: 16,
      marginBottom: 12,
      transition: "border-color .12s",
    }) satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  /* Italic is the artboard's: it marks the rule as the model's words rather
     than the product's. */
  rule: { fontSize: 14, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4 } satisfies CSSProperties,
  evidence: {
    marginTop: 10,
    borderRadius: 7,
    border: "1px solid var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 10px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 11.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    overflow: "auto",
  } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
  confidenceLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceBar: { width: CONFIDENCE_BAR_WIDTH } satisfies CSSProperties,
  confidencePct: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flexShrink: 0,
    width: CARD_ACTIONS_WIDTH,
  } satisfies CSSProperties,
} as const;
