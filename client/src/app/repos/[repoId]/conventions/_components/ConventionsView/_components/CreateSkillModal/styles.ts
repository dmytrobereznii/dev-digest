import type { CSSProperties } from "react";

/** Co-located styles for the conventions CreateSkillModal. */
export const s = {
  body: { padding: "18px 22px 8px" } satisfies CSSProperties,
  /* The merge banner: this modal's whole reason for being a separate component
     from the Skills Lab's create modal. */
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 13px",
    borderRadius: 8,
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    marginBottom: 18,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  bannerText: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  bannerStrong: { color: "var(--text-primary)" } satisfies CSSProperties,
  bannerRepo: { color: "var(--accent-text)" } satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  rowCell: { flex: 1 } satisfies CSSProperties,
  /* The toggle sits on the same baseline as the SelectInput beside it. */
  toggleWrap: { display: "flex", alignItems: "center", height: 36 } satisfies CSSProperties,
  error: { marginTop: 12, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  footerNote: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginRight: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  /* The artboard lifts `v1` out of the muted note in mono — it is the one
     concrete fact in that sentence, so it is the one part that is not grey. */
  footerVersion: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
