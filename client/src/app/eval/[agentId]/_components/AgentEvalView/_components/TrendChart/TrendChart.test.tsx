import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";
import { TrendChart } from "./TrendChart";

afterEach(cleanup);

function pt(i: number, over: Partial<EvalTrendPoint> = {}): EvalTrendPoint {
  return {
    run_id: `r${i}`, ran_at: `2026-10-0${i + 1}T10:00:00Z`, agent_version: i + 1,
    recall: 0.2 * (i + 1), precision: 0.5, citation_accuracy: 1, ...over,
  };
}

function renderChart(points: EvalTrendPoint[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <TrendChart points={points} />
    </NextIntlClientProvider>,
  );
}

const coords = (g: Element) =>
  g.querySelector("polyline")!.getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number) as [number, number]);

describe("TrendChart", () => {
  it("two or more completed runs draw one series per metric, oldest first, under a legend naming Recall, Precision and Citation", () => {
    const { container } = renderChart([pt(0), pt(1), pt(2)]);
    const groups = [...container.querySelectorAll("[data-series]")];
    expect(groups.map((g) => g.getAttribute("data-series"))).toEqual(["recall", "precision", "citation"]);
    for (const g of groups) expect(coords(g)).toHaveLength(3);

    // oldest first: x increases left to right; recall rises, so y (down-positive) falls
    const recall = coords(groups[0]!);
    expect(recall[0]![0]).toBeLessThan(recall[1]![0]);
    expect(recall[1]![0]).toBeLessThan(recall[2]![0]);
    expect(recall[0]![1]).toBeGreaterThan(recall[2]![1]);

    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation")).toBeInTheDocument();
  });

  it("a null metric leaves that run out of that series only", () => {
    const { container } = renderChart([pt(0), pt(1, { recall: null }), pt(2)]);
    const by = (k: string) => container.querySelector(`[data-series="${k}"]`)!;
    expect(coords(by("recall"))).toHaveLength(2);
    expect(coords(by("precision"))).toHaveLength(3);
    expect(coords(by("citation"))).toHaveLength(3);
    // the two recall points keep their own x positions: first and last slot
    const xs = coords(by("recall")).map((c) => c[0]);
    const precisionXs = coords(by("precision")).map((c) => c[0]);
    expect(xs).toEqual([precisionXs[0], precisionXs[2]]);
  });
});
