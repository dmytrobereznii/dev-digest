/* ConventionsView — /repos/:repoId/conventions, transcribed from
   `screen_conv_conf.jsx`'s ScreenConventions.

   Three body states, and which one shows turns on the SCAN, not on the
   candidate list (spec D4):

   - no scan row at all → the `e-conv` empty state, rendered instead of the
     whole body: no header, no toolbar, one "Run extraction" call to action;
   - a scan that grounded nothing → header and subtitle KEPT, so "last scan 2m
     ago" stays true, with the candidate count at zero beneath it. The artboard
     draws no state for this, and falling back to the empty state would claim
     the repo was never scanned — which is exactly what the scan row exists to
     stop;
   - candidates → the toolbar and the cards.

   Re-scan is synchronous (D7): there is no job and nothing to poll, so the
   button goes to "Scanning…" and comes back with a list. */
"use client";

import React from "react";
import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useSetAllConventionStatus,
  useSetConventionStatus,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { acceptedOf, allAccepted, bareRepoName, scanAge } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const setStatus = useSetConventionStatus();
  const setAll = useSetAllConventionStatus();
  const [creating, setCreating] = React.useState(false);

  // Stale/unknown :repoId → the route's 404 boundary, as /pulls does. A
  // repo-scoped page that renders a header for a repo the workspace does not
  // have is the bug this guard exists for.
  if (repoNotFound) notFound();

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const repoName = bareRepoName(activeRepo?.full_name) ?? t("page.repoFallback");
  const candidates = data?.candidates ?? [];
  const accepted = acceptedOf(candidates);
  const allOn = allAccepted(candidates);

  /* A 422 means the repo has no clone on disk — the seeded `acme/payments-api`
     is exactly that, so it is the first failure anyone meets. It is a different
     sentence from a model or network failure, and worth telling apart. */
  const extractError = extract.isError
    ? extract.error instanceof ApiError && extract.error.status === 422
      ? t("page.notCloned")
      : t("page.extractionFailed")
    : null;

  const runExtraction = () => extract.mutate(repoId);

  /* Kept alongside the route's loading.tsx on purpose: this is a client
     component fetching through TanStack Query, so the server-side Suspense
     fallback has already resolved before the query starts and the two cover
     different moments (client INSIGHTS.md, measured). */
  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <div style={s.header}>
            <Skeleton height={26} width={280} />
          </div>
          <div style={s.skeletonStack}>
            {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
              <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  if (!data?.scan) {
    return (
      <AppShell crumb={crumb}>
        {extractError && (
          <div style={s.emptyNotice}>
            <div style={s.notice} role="alert">
              {extractError}
            </div>
          </div>
        )}
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={runExtraction}
          ctaLoading={extract.isPending}
        />
      </AppShell>
    );
  }

  const age = scanAge(data.scan.created_at);

  return (
    <AppShell crumb={crumb}>
      {/* Guarded on the accepted set as well as the flag: the modal merges what
          is accepted, so there is nothing to open with an empty selection. */}
      {creating && accepted.length > 0 && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setCreating(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {t("page.sampleSubtitle", {
                count: data.scan.sample_count,
                when: t(`page.relative.${age.unit}`, { count: age.count }),
              })}
            </p>
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            onClick={runExtraction}
            disabled={extract.isPending}
          >
            {extract.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>

        {extractError && (
          <div style={s.notice} role="alert">
            {extractError}
          </div>
        )}

        {candidates.length === 0 ? (
          <p style={s.zeroCount}>{t("page.candidateCount", { count: 0 })}</p>
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="ghost"
                size="sm"
                icon={allOn ? "X" : "Check"}
                disabled={setAll.isPending}
                onClick={() => setAll.mutate({ repoId, status: allOn ? "pending" : "accepted" })}
              >
                {allOn ? t("page.deselectAll") : t("page.acceptAll")}
              </Button>
              <span style={s.toolbarCount}>
                {t("page.acceptedCount", {
                  accepted: accepted.length,
                  total: candidates.length,
                })}
              </span>
              <div style={s.toolbarRight}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  onClick={() => setCreating(true)}
                  disabled={accepted.length === 0}
                  style={accepted.length === 0 ? s.createDim : undefined}
                >
                  {t("page.createSkill")}
                </Button>
              </div>
            </div>

            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                c={c}
                pending={setStatus.isPending && setStatus.variables?.id === c.id}
                onSetStatus={(id, status) => setStatus.mutate({ repoId, id, status })}
              />
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
