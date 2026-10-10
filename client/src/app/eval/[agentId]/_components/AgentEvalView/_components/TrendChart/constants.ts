import type { EvalTrendPoint } from "@devdigest/shared";
import type { METRIC_COLOR } from "@/components/eval/constants";

/** The three series: the colour key (also the legend key) and the trend-point field. */
export const SERIES: ReadonlyArray<{
  key: keyof typeof METRIC_COLOR;
  field: keyof Pick<EvalTrendPoint, "recall" | "precision" | "citation_accuracy">;
}> = [
  { key: "recall", field: "recall" },
  { key: "precision", field: "precision" },
  { key: "citation", field: "citation_accuracy" },
];

export const WIDTH = 720;
export const HEIGHT = 240;
export const PAD = { top: 12, right: 16, bottom: 12, left: 36 };

/** Y-axis gridlines, in percent; the axis always spans 0 to 100. */
export const GRID_LINES = [0, 25, 50, 75, 100];
