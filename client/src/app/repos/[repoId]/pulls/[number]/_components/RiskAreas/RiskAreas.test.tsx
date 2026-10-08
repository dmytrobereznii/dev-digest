import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { brief as messages } from "@/test/messages";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

function renderRisks(risks: Risk[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} />
    </NextIntlClientProvider>,
  );
}

function risk(over: Partial<Risk> = {}): Risk {
  return {
    kind: "security",
    title: "Token compared with ==",
    explanation: "ignored here",
    severity: "high",
    file_refs: ["src/auth/token.ts"],
    ...over,
  };
}

/** The markup of an icon drawn on its own, to compare a risk's icon against. */
function iconMarkup(name: IconName): string {
  const I = Icon[name];
  const { container, unmount } = render(<I size={14} />);
  const html = container.querySelector("svg")!.innerHTML;
  unmount();
  return html;
}

function firstIconMarkup(container: HTMLElement): string {
  return container.querySelector("li svg")!.innerHTML;
}

describe("RiskAreas", () => {
  it("lists each risk's title and file references under Risk areas", () => {
    renderRisks([
      risk({ title: "Token compared with ==", file_refs: ["src/auth/token.ts", "src/auth/jwt.ts"] }),
      risk({ kind: "perf", severity: "low", title: "N+1 query in list", file_refs: ["src/db/list.ts"] }),
    ]);
    expect(screen.getByText(messages.block.risks)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Token compared with ==/)).toBeInTheDocument();
    expect(screen.getByText(/N\+1 query in list/)).toBeInTheDocument();
    expect(screen.getByText("src/auth/token.ts")).toBeInTheDocument();
    expect(screen.getByText("src/auth/jwt.ts")).toBeInTheDocument();
    expect(screen.getByText("src/db/list.ts")).toBeInTheDocument();
  });

  it.each([
    ["high", "var(--crit)"],
    ["medium", "var(--warn)"],
    ["low", "var(--info)"],
  ] as const)("colours a %s risk's icon %s", (severity, colour) => {
    const { container } = renderRisks([risk({ severity })]);
    const svg = container.querySelector("li svg") as SVGElement;
    expect(svg.style.color).toBe(colour);
  });

  it.each([
    ["security", "Shield"],
    ["db_migration", "Database"],
    ["breaking_api", "AlertOctagon"],
    ["perf", "Zap"],
    ["deps", "Boxes"],
    ["something_else", "AlertTriangle"],
  ] as const)("draws the %s kind with the %s icon", (kind, icon) => {
    const { container } = renderRisks([risk({ kind })]);
    expect(firstIconMarkup(container)).toBe(iconMarkup(icon));
  });

  it("uses distinct icons for distinct kinds", () => {
    expect(iconMarkup("Shield")).not.toBe(iconMarkup("AlertTriangle"));
  });

  it("zero risks shows No notable risks flagged.", () => {
    renderRisks([]);
    expect(screen.getByText(messages.noRisks)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("severity is available as text and a file reference carries its full text as title", () => {
    renderRisks([
      risk({ severity: "high", title: "A", file_refs: ["src/a/very/long/path/to/file.ts"] }),
      risk({ severity: "medium", title: "B", file_refs: [] }),
      risk({ severity: "low", title: "C", file_refs: [] }),
    ]);
    expect(screen.getByText(new RegExp(messages.risk.severity.high))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(messages.risk.severity.medium))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(messages.risk.severity.low))).toBeInTheDocument();
    expect(screen.getByText("src/a/very/long/path/to/file.ts")).toHaveAttribute(
      "title",
      "src/a/very/long/path/to/file.ts",
    );
  });

  it("markup in a risk title or file reference renders as text, and a file reference is not a link", () => {
    const title = '<img src="x" onerror="alert(1)">Title';
    const ref = '<a href="https://evil.test">src/x.ts</a>';
    const { container } = renderRisks([risk({ title, file_refs: [ref] })]);
    expect(screen.getByText(ref)).toBeInTheDocument();
    expect(screen.getByText(new RegExp("Title"))).toHaveTextContent(title);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each(["constructor", "toString", "valueOf", "other"])(
    "a kind that is an Object.prototype key renders the default icon and does not throw (%s)",
    (kind) => {
      const { container } = renderRisks([risk({ kind })]);
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(firstIconMarkup(container)).toBe(iconMarkup("AlertTriangle"));
    },
  );

  it("each risk is a bordered pill with its file references in the accent colour, as text", () => {
    renderRisks([risk({ file_refs: ["src/auth/token.ts"] })]);
    const pill = screen.getByRole("listitem");
    expect(pill.style.padding).toBe("5px 10px");
    expect(pill.style.borderRadius).toBe("6px");
    expect(pill.style.border).toBe("1px solid var(--border)");
    const ref = screen.getByText("src/auth/token.ts");
    expect(ref.style.color).toBe("var(--accent-text)");
    expect(ref).toHaveClass("mono");
    expect(ref.closest("a,button")).toBeNull();
  });

  it("a plain file reference is not a link either", () => {
    renderRisks([risk({ file_refs: ["src/auth/token.ts"] })]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
