import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { context } from "@/test/messages";

const state: { content: string } = { content: "" };

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocumentContent: () => ({
    data: { path: "docs/a.md", content: state.content, tokens: 3 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { DocumentPreview } from "./DocumentPreview";

function renderPreview(content: string) {
  state.content = content;
  return render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <DocumentPreview repoId="r1" path="docs/a.md" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => cleanup());

describe("DocumentPreview", () => {
  it("renders the document content as Markdown with no edit control", () => {
    renderPreview("# Title\n\nSome **bold** text");

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeTruthy();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("raw HTML in a document is not rendered as elements", () => {
    renderPreview(
      'before <script>window.__pwned = 1</script> <img src="x" onerror="alert(1)"> <b id="raw">raw</b> after',
    );

    // The document's own text is still shown, only the markup is not live.
    expect(screen.getByText(/before/)).toBeTruthy();
    expect(screen.getByText(/after/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    // A rendered <b> would split "raw" into its own element.
    expect(screen.queryByText("raw", { selector: "b" })).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
