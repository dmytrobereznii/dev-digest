import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * Editor tabs — Config, Preview and Versions.
 *
 * The design draws five (`Config · Preview · Evals · Stats · Versions`); the
 * remaining two are deferred on purpose (spec D7): Evals needs the L06 eval
 * pipeline, and Stats needs per-skill run attribution nothing records yet. A
 * disabled or placeholder tab would be a dead control, so they are absent
 * rather than greyed out. The route's `VALID_TABS` is derived from this list.
 */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "GitCommit" },
];
