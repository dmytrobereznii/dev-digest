/**
 * FileCard's new annotation seam (D7, D9, D10 in spec 08): a marker bar +
 * pill on the matched line, the annotation node rendered under that row, an
 * "outside the diff" block for annotations that don't land on a rendered
 * line, a finding dot separate from the GitHub comment counter, and
 * `startClosed`. None of this exists yet, so every case but the regression
 * one is expected to fail until FileCard grows these props.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, PrReviewComment } from "@/lib/types";
import { shell } from "@/test/messages";
import { FileCard } from "./FileCard";
import type { DiffCommentApi } from "../comments";
import type { LineAnnotation } from "../annotations";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Three rendered lines: a context row (old/new 1), then two added rows
// (new 2 "added line", new 3 "another added line") — small enough to
// auto-open under today's AUTO_EXPAND_MAX_LINES rule.
const PATCH = ["@@ -1,2 +1,3 @@", " context line", "+added line", "+another added line"].join(
  "\n",
);

function buildFile(o: Partial<PrFile> = {}): PrFile {
  return { path: "src/foo.ts", additions: 2, deletions: 0, patch: PATCH, ...o };
}

// A single-line patch whose gutter number (50) can't collide with a small
// comment count — buildFile's gutter numbers (1-3) would otherwise match
// screen.getByText("1") ambiguously.
const SINGLE_LINE_PATCH = ["@@ -50,1 +50,1 @@", " context line"].join("\n");

function buildSingleLineFile(o: Partial<PrFile> = {}): PrFile {
  return { path: "src/foo.ts", additions: 0, deletions: 0, patch: SINGLE_LINE_PATCH, ...o };
}

function comment(o: Partial<PrReviewComment> & Pick<PrReviewComment, "id" | "path">): PrReviewComment {
  return {
    line: 2,
    original_line: 2,
    side: "RIGHT",
    body: "hi",
    user: "octocat",
    created_at: "2026-09-16T00:00:00Z",
    html_url: "https://github.com/x/y/pull/1#discussion_r1",
    in_reply_to_id: null,
    is_outdated: false,
    ...o,
  };
}

function commentingApi(comments: PrReviewComment[]): DiffCommentApi {
  return {
    comments,
    canComment: false,
    showComments: false,
    posting: false,
    onSubmit: async () => {},
  };
}

describe("FileCard — regression (no new props)", () => {
  it("renders exactly today's output: path, auto-opened lines, no dot or marker", () => {
    const file = buildFile();
    renderWithIntl(<FileCard file={file} />);

    expect(screen.getByText(file.path)).toBeInTheDocument();
    expect(screen.getByText("added line")).toBeInTheDocument();
    expect(screen.queryByTestId("finding-dot")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-marker-bar")).not.toBeInTheDocument();
  });
});

describe("FileCard — annotations (D7, D9)", () => {
  it("renders a marker bar and pill on the matched line, plus the annotation node", () => {
    const file = buildFile();
    const annotations: LineAnnotation[] = [
      {
        id: "a1",
        keys: ["RIGHT:2"],
        marker: { color: "var(--crit)", label: "Flagged", icon: "AlertTriangle" },
        node: "Flagged: leaks a secret",
      },
    ];
    renderWithIntl(<FileCard file={file} annotations={annotations} />);

    const bar = screen.getByTestId("line-marker-bar");
    expect(bar.getAttribute("style") ?? "").toContain("var(--crit)");
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("Flagged: leaks a secret")).toBeInTheDocument();
  });

  it("keeps a matched annotation under its own row and moves an unanchored one to the file's end", () => {
    const file = buildFile();
    const annotations = [
      { id: "matched", keys: ["RIGHT:2"], marker: null, node: "On the line" },
      { id: "stray", keys: ["RIGHT:999"], marker: null, node: "Off the diff" },
    ];
    const { container } = renderWithIntl(<FileCard file={file} annotations={annotations} />);

    expect(screen.getByText("On the line")).toBeInTheDocument();
    expect(screen.getByText("Off the diff")).toBeInTheDocument();

    // Order in the rendered document: row 2's code, then its annotation,
    // then row 3's code (unmarked), then the unanchored block at the end.
    const html = container.textContent ?? "";
    const iAddedLine = html.indexOf("added line");
    const iOnLine = html.indexOf("On the line");
    const iAnotherLine = html.indexOf("another added line");
    const iOffDiff = html.indexOf("Off the diff");
    expect(iAddedLine).toBeGreaterThanOrEqual(0);
    expect(iOnLine).toBeGreaterThan(iAddedLine);
    expect(iAnotherLine).toBeGreaterThan(iOnLine);
    expect(iOffDiff).toBeGreaterThan(iAnotherLine);
  });
});

describe("FileCard — finding dot (D10)", () => {
  it("shows a finding dot when flagged, distinct from the GitHub comment counter", () => {
    const file = buildSingleLineFile();
    const comments = [comment({ id: 1, path: file.path })];
    renderWithIntl(<FileCard file={file} commenting={commentingApi(comments)} flagged />);

    const dot = screen.getByTestId("finding-dot");
    const counter = screen.getByText("1");
    expect(dot).not.toBe(counter);
  });

  it("shows no finding dot when not flagged, while the comment counter is unaffected", () => {
    const file = buildSingleLineFile();
    const comments = [comment({ id: 1, path: file.path })];
    renderWithIntl(<FileCard file={file} commenting={commentingApi(comments)} />);

    expect(screen.queryByTestId("finding-dot")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("FileCard — startClosed (D7)", () => {
  it("starts closed even though the file is under the auto-expand line threshold", () => {
    const file = buildFile();
    renderWithIntl(<FileCard file={file} startClosed />);

    expect(screen.getByText(file.path)).toBeInTheDocument();
    expect(screen.queryByText("added line")).not.toBeInTheDocument();
  });
});

describe("FileCard — flagged forces open regardless of size (D6)", () => {
  it("renders open when the file has findings, even over the auto-expand line threshold", () => {
    // additions + deletions (210) is over AUTO_EXPAND_MAX_LINES (200).
    const file = buildFile({ additions: 150, deletions: 60 });
    renderWithIntl(<FileCard file={file} flagged />);

    expect(screen.getByText("added line")).toBeInTheDocument();
  });

  it("stays closed when the file is unflagged and over the auto-expand line threshold", () => {
    const file = buildFile({ additions: 150, deletions: 60 });
    renderWithIntl(<FileCard file={file} />);

    expect(screen.queryByText("added line")).not.toBeInTheDocument();
  });
});
