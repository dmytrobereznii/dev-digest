"use client";

import { useTranslations } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { METRIC_COLOR } from "@/components/eval/constants";
import { toPct } from "@/components/eval/helpers";
import { SERIES, WIDTH, HEIGHT, PAD, GRID_LINES } from "./constants";
import { s } from "./styles";

export interface TrendChartProps {
  /** Completed runs, oldest first. */
  points: EvalTrendPoint[];
}

/** One polyline per metric over the runs; a run whose metric is null leaves a gap-free skip. */
export function TrendChart({ points }: TrendChartProps) {
  const t = useTranslations("eval.agentView");
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH;

  return (
    <div>
      <div style={s.legend}>
        {SERIES.map((m) => (
          <span key={m.key} style={s.legendItem}>
            <span style={{ ...s.swatch, background: METRIC_COLOR[m.key] }} aria-hidden />
            {t(`legend.${m.key}`)}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("metricTrend")}
        style={s.svg}
      >
        {GRID_LINES.map((pct) => (
          <g key={pct}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(pct)}
              y2={y(pct)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(pct) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {pct}
            </text>
          </g>
        ))}
        {SERIES.map((m) => {
          const pts = points
            .map((p, i) => ({ pct: toPct(p[m.field]), i }))
            .filter((p): p is { pct: number; i: number } => p.pct != null);
          if (pts.length === 0) return null;
          return (
            <g key={m.key} data-series={m.key}>
              <polyline
                points={pts.map((p) => `${x(p.i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={METRIC_COLOR[m.key]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.pct)} r={2.5} fill={METRIC_COLOR[m.key]} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
