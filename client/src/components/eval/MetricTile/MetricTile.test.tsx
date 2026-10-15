import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { eval as evalMessages } from "@/test/messages";
import { MetricTile, type MetricTileProps } from "./MetricTile";

function renderTile(props: MetricTileProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <MetricTile {...props} />
    </NextIntlClientProvider>,
  );
}

describe("MetricTile", () => {
  it("shows the label, the value and a delta with an arrow and the points as text", () => {
    const { container, rerender } = renderTile({
      label: "Recall", value: "83%", delta: 8, color: "var(--accent)", trend: [0.7, 0.83],
    });
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("▲ 8pt")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <MetricTile label="Recall" value="75%" delta={-8} color="var(--accent)" trend={[0.83, 0.75]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("▼ 8pt")).toBeInTheDocument();
  });

  it("a null value shows — with no delta and no sparkline", () => {
    const { container } = renderTile({
      label: "Precision", value: null, delta: 5, color: "var(--ok)", trend: [0.5, 0.6],
    });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/pt$/)).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("a zero delta shows 0pt with no arrow", () => {
    renderTile({ label: "Citation", value: "90%", delta: 0, color: "var(--warn)", trend: [0.9] });
    expect(screen.getByText("0pt")).toBeInTheDocument();
    expect(screen.queryByText(/[▲▼]/)).toBeNull();
  });
});
