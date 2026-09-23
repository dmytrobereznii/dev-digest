import type { CSSProperties } from "react";

/** Styles for one Smart Diff role group (chevron header + DiffViewer body). */
export const s = {
  group: { marginBottom: 18 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 0",
    marginBottom: 8,
    cursor: "pointer",
  } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  right: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  flagCount: { fontSize: 11, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  filesCount: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

/** 8x8 role-colour square before the group label. */
export function swatchStyle(color: string): CSSProperties {
  return { width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 };
}

/** Chevron rotates 90deg when the group is open (mirrors FileCard's). */
export function chevronFor(open: boolean): CSSProperties {
  return { color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" };
}
