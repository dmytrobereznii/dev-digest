/* DiffTab — the Smart Diff view: a role-grouped, reviewer-ordered diff with
   inline findings from the latest review, plus a flat "Original order"
   fallback (spec 08 §7 step 6, D3-D11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  useSmartDiff,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { RoleGroup } from "./_components/RoleGroup";
import { OrderToggle, type DiffOrder } from "./_components/OrderToggle";
import { getViewGroups, getFindingAnnotations, sortFilesByPath } from "./helpers";
import { s } from "./styles";

const SKELETON_ROWS = 4;

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff, isLoading: sdLoading, isError: sdError } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const dismiss = useFindingAction();

  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Not URL state, as in the design (D11) — a route error also forces this view.
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  const effectiveOrder: DiffOrder = sdError ? "original" : order;

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.postFailed"));
        throw err;
      }
    },
  };

  // The review the /smart-diff response was built from — never a union of
  // reviews (D4), so dots and inline cards always agree.
  const review = React.useMemo(
    () => reviews?.find((r) => r.id === smartDiff?.review_id) ?? null,
    [reviews, smartDiff],
  );

  const renderFinding = React.useCallback(
    (f: FindingRecord) => (
      <FindingCard
        key={f.id}
        f={f}
        defaultExpanded
        pending={dismiss.isPending}
        onAction={(action) => dismiss.mutate({ findingId: f.id, action, prId: prId ?? undefined })}
      />
    ),
    [dismiss, prId],
  );

  const annotations = React.useMemo(
    () => getFindingAnnotations(review, t, renderFinding),
    [review, t, renderFinding],
  );

  const groups = React.useMemo(
    () => (smartDiff ? getViewGroups(files, smartDiff) : []),
    [files, smartDiff],
  );

  // Same flagged-file dot the smart groups show, for the flat "Original
  // order" / loading-error fallback views (A10, A14).
  const flaggedPaths = React.useMemo(() => {
    const paths = new Set<string>();
    for (const group of smartDiff?.groups ?? []) {
      for (const f of group.files) if (f.finding_lines.length > 0) paths.add(f.path);
    }
    return paths;
  }, [smartDiff]);

  const totals = React.useMemo(
    () =>
      files.reduce(
        (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );

  const noReviewYet = !!smartDiff && smartDiff.review_id === null;
  const showGroups = !sdLoading && !sdError && effectiveOrder === "smart" && groups.length > 0;
  // The flat fallback (Original order, loading error, or no groups) sorts by
  // path (Fix 2), not pr.files's own order — same as the design's flat branch.
  const flatFiles = React.useMemo(() => sortFilesByPath(files), [files]);

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments")} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.title")}
      </SectionLabel>

      <div style={s.statsRow}>
        <span style={s.stats}>
          {t.rich("smartDiff.stats", {
            count: filesCount,
            additions: totals.additions,
            deletions: totals.deletions,
            add: (chunks) => <span style={s.addText}>{chunks}</span>,
            del: (chunks) => <span style={s.delText}>{chunks}</span>,
          })}
        </span>
        <div style={s.toggleSlot}>
          <OrderToggle value={effectiveOrder} onChange={setOrder} smartDisabled={sdError} />
        </div>
      </div>

      {sdError && <div style={s.unavailable}>{t("smartDiff.unavailable")}</div>}
      {!sdError && noReviewYet && <div style={s.noReview}>{t("smartDiff.noReview")}</div>}

      {sdLoading ? (
        <div style={s.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : showGroups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup key={g.role} role={g.role} files={g.files} commenting={commenting} annotations={annotations} />
          ))}
        </div>
      ) : (
        <DiffViewer files={flatFiles} commenting={commenting} annotations={annotations} flaggedPaths={flaggedPaths} />
      )}
    </section>
  );
}
