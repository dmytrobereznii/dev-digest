"use client";

import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { NO_VALUE } from "../constants";
import { s } from "./styles";

export interface MetricTileProps {
  label: string;
  /** The display text; null renders "—" with no delta and no sparkline. */
  value: string | null;
  /** Change in points against the previous run; null or undefined hides it. */
  delta?: number | null;
  color?: string;
  /** Series for the optional sparkline, nulls already removed. */
  trend?: number[];
}

/** A KPI tile: label, value, delta in points with an arrow, optional sparkline. */
export function MetricTile({ label, value, delta, color, trend }: MetricTileProps) {
  const t = useTranslations("eval.metrics");
  const hasValue = value != null;
  const showDelta = hasValue && delta != null;
  const direction = !delta ? "flat" : delta > 0 ? "up" : "down";
  const deltaColor =
    direction === "up" ? "var(--ok)" : direction === "down" ? "var(--crit)" : "var(--text-muted)";

  return (
    <div style={s.tile}>
      <div style={s.label}>{label}</div>
      <div style={s.row}>
        <span style={s.value}>{hasValue ? value : NO_VALUE}</span>
        {showDelta && (
          <span style={{ ...s.delta, color: deltaColor }}>
            {t("delta", { direction, n: Math.abs(delta) })}
          </span>
        )}
      </div>
      {hasValue && trend && trend.length > 0 && (
        <div style={s.spark}>
          <Sparkline data={trend} color={color} />
        </div>
      )}
    </div>
  );
}
