/** Constants for the Smart Diff view (spec 08 §7 step 6). */
import type { SmartDiffRole, Severity } from "@devdigest/shared";

/** Per-role UI: swatch colour, i18n label/description keys, and whether the
    group starts expanded (D3/D6/D12). D6's per-file boilerplate rule ("closed
    unless flagged, regardless of size") is NOT forced onto DiffViewer's
    shared `startClosed` here: the group's own collapse already keeps an
    unopened boilerplate file's content out of the DOM, and a per-file
    `startClosed` on top of that would force a second click to reveal a small,
    unflagged boilerplate file once its group is expanded — which the
    DiffTab "collapse defaults" case (D6/A8) exercises with a single click and
    the design doesn't ask for either. `FileCard`'s own auto-expand-by-size
    default, plus `flagged` forcing a file open (FileCard.tsx), covers the
    rest of D6 without a role-keyed override here. */
export const ROLE_UI: Record<
  SmartDiffRole,
  { color: string; labelKey: string; descKey: string; groupOpen: boolean }
> = {
  core: {
    color: "var(--accent)",
    labelKey: "smartDiff.coreLabel",
    descKey: "smartDiff.desc.core",
    groupOpen: true,
  },
  tests: {
    color: "var(--ok)",
    labelKey: "smartDiff.testsLabel",
    descKey: "smartDiff.desc.tests",
    groupOpen: true,
  },
  wiring: {
    color: "var(--warn)",
    labelKey: "smartDiff.wiringLabel",
    descKey: "smartDiff.desc.wiring",
    groupOpen: true,
  },
  docs: {
    color: "var(--info)",
    labelKey: "smartDiff.docsLabel",
    descKey: "smartDiff.desc.docs",
    groupOpen: false,
  },
  boilerplate: {
    color: "var(--text-muted)",
    labelKey: "smartDiff.boilerplateLabel",
    descKey: "smartDiff.desc.boilerplate",
    groupOpen: false,
  },
};

/** Highest-severity-wins ranking for the line marker (D9). */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};
