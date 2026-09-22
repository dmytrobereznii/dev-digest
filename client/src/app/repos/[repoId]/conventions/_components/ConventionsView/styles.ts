import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (shared with the route's loading.tsx). */
export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 880, margin: "0 auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  scanButtons: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  } satisfies CSSProperties,
  toolbarCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  toolbarRight: { marginLeft: "auto" } satisfies CSSProperties,
  /* The artboard's own affordance for "nothing accepted yet": the button stays
     put and dims rather than disappearing, so the path to a skill is always
     visible. It is `disabled` too — the opacity is the design, the attribute is
     the truth a screen reader and a click both read. */
  createDim: { opacity: 0.5 } satisfies CSSProperties,
  /* A scan that grounded nothing. The artboard draws no state for it; keeping
     the header and this one line is how "last scan 2m ago" survives, instead of
     an empty state that would claim the repo was never scanned. */
  zeroCount: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  notice: {
    marginBottom: 16,
    padding: "10px 13px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
} as const;
