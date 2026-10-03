/** BlastRadiusCard — spec 10 §6.2, T6. `@/lib/hooks/blast` is mocked (repo
    idiom — no fetch, no MSW), as `IntentCard.test.tsx` mocks `@/lib/hooks/intent`. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import blast from "@/../messages/en/blast.json";
import brief from "@/../messages/en/brief.json";
import type { BlastRadiusResponse } from "@devdigest/shared";

let queryData: BlastRadiusResponse | undefined;
let queryLoading = false;
let queryError = false;

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => ({ data: queryData, isLoading: queryLoading, isError: queryError }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  queryData = undefined;
  queryLoading = false;
  queryError = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, blast }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const OK_RESPONSE: BlastRadiusResponse = {
  changed_symbols: [
    { name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/mw/rateLimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "handleRequest", file: "src/api/handler.ts", line: 42 },
        { name: "middleware", file: "src/api/middleware.ts", line: 10 },
      ],
      endpoints_affected: ["POST /api/public/login"],
      crons_affected: ["job:cleanup"],
    },
    {
      symbol: "bucketKey",
      callers: [{ name: "makeKey", file: "src/mw/keys.ts", line: 5 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 symbols changed → 3 callers, 1 endpoint, 1 cron",
  status: "ok",
  degraded_reason: null,
  index_sha: "abc123",
  stats: { symbols: 2, callers: 3, endpoints: 1, crons: 1 },
  truncated: false,
};

describe("BlastRadiusCard", () => {
  it("shows the stat line, an open first row and a collapsed second row that opens on click", () => {
    queryData = OK_RESPONSE;
    const { container } = renderWithIntl(
      <BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />,
    );

    // The bold count and its plural label are separate DOM nodes (design's
    // `<b>{n}</b> label`), so the combined text is asserted on the container
    // via `toHaveTextContent`, which aggregates nested text — unlike
    // `getByText`, which matches only an element's own direct text nodes.
    expect(container).toHaveTextContent("2 symbols");
    expect(container).toHaveTextContent("3 callers");
    expect(container).toHaveTextContent("1 endpoint");
    expect(container).toHaveTextContent("1 cron");

    // first group open by default: both callers, endpoint chip, cron chip visible
    expect(screen.getByText("handleRequest")).toBeInTheDocument();
    expect(screen.getByText("middleware")).toBeInTheDocument();
    expect(screen.getByText("POST /api/public/login")).toBeInTheDocument();
    expect(screen.getByText("job:cleanup")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/api/handler.ts:42" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/abc123/src/api/handler.ts#L42");
    expect(link).toHaveAttribute("target", "_blank");

    // second group collapsed by default
    expect(screen.queryByText("makeKey")).not.toBeInTheDocument();
    const bucketKeyToggle = screen.getByRole("button", { name: /bucketKey\(\)/ });
    expect(bucketKeyToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bucketKeyToggle);
    expect(bucketKeyToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("makeKey")).toBeInTheDocument();

    const graphButton = screen.getByRole("button", { name: "Graph" });
    expect(graphButton).toBeDisabled();
  });

  it("falls back to headSha when index_sha is null", () => {
    queryData = { ...OK_RESPONSE, index_sha: null };
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />);
    const link = screen.getByRole("link", { name: "src/api/handler.ts:42" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/headsha/src/api/handler.ts#L42");
  });

  it("shows the truncated note", () => {
    queryData = { ...OK_RESPONSE, truncated: true };
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />);
    expect(
      screen.getByText("Some symbols have more callers than shown; the highest-ranked files are listed."),
    ).toBeInTheDocument();
  });

  it("shows only the degraded notice with no rows", () => {
    queryData = {
      ...OK_RESPONSE,
      downstream: [],
      status: "degraded",
      degraded_reason: "no_data",
      stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 },
    };
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />);
    expect(
      screen.getByText(
        "This repository has no index yet; any callers shown come from a text search and may be incomplete.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("handleRequest")).not.toBeInTheDocument();
  });

  it("shows the degraded notice and the tree when there are rows", () => {
    queryData = { ...OK_RESPONSE, status: "degraded", degraded_reason: "index_partial" };
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />);
    expect(
      screen.getByText("The repository index is partial, so some callers may be missing."),
    ).toBeInTheDocument();
    expect(screen.getByText("handleRequest")).toBeInTheDocument();
  });

  it("shows noDownstream when ok with no rows", () => {
    queryData = {
      ...OK_RESPONSE,
      downstream: [],
      stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 },
    };
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="o/r" headSha="headsha" />);
    expect(screen.getByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
  });
});
