import type { IconName } from "@devdigest/ui";

/** Icon per risk kind, as the design maps it (screen_pr_detail.jsx:20). */
export const RISK_ICON: Record<string, IconName> = {
  security: "Shield",
  db_migration: "Database",
  breaking_api: "AlertOctagon",
  perf: "Zap",
  deps: "Boxes",
};

/** Icon for any kind the map does not name. */
export const DEFAULT_RISK_ICON: IconName = "AlertTriangle";

/** Icon colour per severity (screen_pr_detail.jsx:21). */
export const RISK_SEV = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
} as const;
