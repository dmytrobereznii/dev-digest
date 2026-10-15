import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunSummary } from "@devdigest/shared";
import { eval as evalMessages } from "@/test/messages";
import { RunsTable } from "./RunsTable";

function run(over: Partial<EvalRunSummary>): EvalRunSummary {
  return {
    id: "r1", agent_id: "a1", status: "completed", ran_at: "2026-10-10T14:32:00Z",
    duration_ms: 1000, agent_version: 2, model: "gpt-x", provider: "openai",
    recall: 0.825, precision: 0.5, citation_accuracy: 1, traces_passed: 3, traces_total: 4,
    cost_usd: 0.0123, error: null, ...over,
  };
}

function renderTable(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunsTable", () => {
  it("renders Ran at, Version, Recall, Precision, Citation, Pass and Cost for each run in the order given", () => {
    renderTable(
      <RunsTable runs={[run({ id: "new", agent_version: 3 }), run({ id: "old", agent_version: 1 })]} />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("v3")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("v1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("3/4")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.0123")).toBeInTheDocument();
  });

  it("a metric cell has a bar and a whole percentage; a null metric shows — and no bar", () => {
    const { container } = renderTable(<RunsTable runs={[run({ recall: 0.825, precision: null, citation_accuracy: 1 })]} />);
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    const cells = screen.getAllByRole("row")[1]!.querySelectorAll("td");
    // Ran at, Version, Recall, Precision, Citation, Pass, Cost
    expect(cells[2]!.querySelector("[aria-hidden]")).not.toBeNull();
    expect(cells[3]!.textContent).toBe("—");
    expect(cells[3]!.querySelector("[aria-hidden]")).toBeNull();
    expect(container.querySelectorAll("td [aria-hidden]")).toHaveLength(2);
  });

  it("a running or failed run shows its status in place of the metric bars", () => {
    const { container } = renderTable(
      <RunsTable
        runs={[
          run({ id: "a", status: "running", recall: null, precision: null, citation_accuracy: null, traces_passed: null }),
          run({ id: "b", status: "failed", recall: null, precision: null, citation_accuracy: null, traces_passed: null }),
        ]}
      />,
    );
    expect(screen.getByText("Running…")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(container.querySelectorAll("td [aria-hidden]")).toHaveLength(0);
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("a null cost shows —", () => {
    renderTable(<RunsTable runs={[run({ cost_usd: null })]} />);
    const cells = screen.getAllByRole("row")[1]!.querySelectorAll("td");
    expect(cells[cells.length - 1]!.textContent).toBe("—");
  });

  it("with no leading cell there is no checkbox", () => {
    const { unmount } = renderTable(<RunsTable runs={[run({})]} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();

    renderTable(
      <RunsTable
        runs={[run({})]}
        selection={{ selectedIds: [], max: 2, onToggle: () => {} }}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
});
