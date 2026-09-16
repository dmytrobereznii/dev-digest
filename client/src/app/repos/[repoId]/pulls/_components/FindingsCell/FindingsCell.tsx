/* FindingsCell — the PR list's Findings column: per-severity counts of the
   latest review, and on hover a popover previewing that run's findings.
   Ported from screen_dashboard.jsx (FindingsCell). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SeverityCounts } from "@devdigest/ui";
import type { SeverityCounts as Counts } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPopover } from "./FindingsPopover";
import { latestRunFindings, totalFindings } from "./helpers";
import { CLOSE_DELAY_MS, POPOVER_FLIP_BELOW, POPOVER_GAP } from "./constants";
import { s } from "./styles";

type Position = { left: number; top?: number; bottom?: number };

export function FindingsCell({
  prId,
  counts,
}: {
  prId: string | null | undefined;
  counts: Counts | null | undefined;
}) {
  const t = useTranslations("prReview");
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = React.useState<Position | null>(null);
  // Findings load on first hover, not with the list: the list endpoint ships
  // only counts, and TanStack Query caches the reviews for later hovers.
  const [armed, setArmed] = React.useState(false);
  const reviews = usePrReviews(armed ? prId : null);

  const total = totalFindings(counts);
  React.useEffect(() => () => clearTimeout(closeTimer.current ?? undefined), []);

  if (total === 0) return <span style={s.empty}>—</span>;

  const open = () => {
    clearTimeout(closeTimer.current ?? undefined);
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const roomBelow = window.innerHeight - r.bottom;
    setPos(
      roomBelow < POPOVER_FLIP_BELOW
        ? { left: r.left, bottom: window.innerHeight - r.top + POPOVER_GAP }
        : { left: r.left, top: r.bottom + POPOVER_GAP },
    );
    setArmed(true);
  };
  // Delayed so the pointer can cross the gap into the popover without it closing.
  const close = () => {
    clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  };

  const title = t("list.findingsPopover.title", { count: total });

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label={title}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        style={s.trigger}
      >
        <SeverityCounts counts={counts} />
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            aria-label={title}
            onMouseEnter={open}
            onMouseLeave={close}
            // Rendered in a portal, but React still bubbles the click to the
            // row, which would navigate to the PR.
            onClick={(e) => e.stopPropagation()}
            style={s.popover(pos)}
          >
            <FindingsPopover
              count={total}
              findings={latestRunFindings(reviews.data)}
              loading={reviews.isPending}
              error={reviews.isError}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
