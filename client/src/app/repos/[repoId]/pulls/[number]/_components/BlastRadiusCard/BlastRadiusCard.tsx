/* BlastRadiusCard — the design's `BlastRadius` (blast.jsx:75-87), the tree
   from image 11 plus the right-aligned caller name from image 13 (spec 10
   D8). Everything shown here is read from the repo-intel index the server
   already built — there is no model call and no fresh analysis. Replaces the
   Overview tab's "Coming in a later lesson" placeholder.
   Lives in the PR Brief section of the Overview tab (spec 10 §6.2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, ErrorState, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import type { IconName } from "@devdigest/ui";
import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";
import { usePrBlast } from "@/lib/hooks/blast";
import { getCallerHref, getSymbolLabel } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string | null;
}

/** One stat in the summary line: bold count + a pluralised label. */
function Stat({ icon, count, label }: { icon: IconName; count: number; label: string }) {
  const I = Icon[icon];
  return (
    <span style={s.stat}>
      <I size={13} style={s.statIcon} />
      <b className="tnum" style={s.statCount}>
        {count}
      </b>{" "}
      {label}
    </span>
  );
}

/** One caller row: file:line link (pinned to `sha`), then the caller name,
    muted and right-aligned (D8). Falls back to plain mono text with no
    repo/sha to link against (D7). Ports the design's `TreeRow` guide lines
    (blast.jsx:13-24): a vertical rule down to the next row, and an 8px tick
    at the row's centre. `last` stops the vertical rule at 50% — the last
    caller with no chip row following it (D8 fix). */
function CallerRow({
  caller,
  repoFullName,
  sha,
  last,
}: {
  caller: BlastCaller;
  repoFullName: string | null;
  sha: string | null;
  last: boolean;
}) {
  const href = getCallerHref(repoFullName, sha, caller);
  const label = `${caller.file}:${caller.line}`;
  return (
    <div style={s.callerRow}>
      <span style={{ ...s.callerGuideV, bottom: last ? "50%" : 0 }} />
      <span style={s.callerGuideH} />
      <Icon.CornerDownRight size={13} style={s.callerIcon} />
      <span title={caller.file} style={s.callerPath}>
        {href ? (
          <MonoLink href={href}>{label}</MonoLink>
        ) : (
          <span className="mono" style={s.callerPathText}>
            {label}
          </span>
        )}
      </span>
      <span style={s.callerName}>{caller.name}</span>
    </div>
  );
}

/** One collapsible downstream group: the changed symbol, its callers, then
    the endpoint and cron chips those callers' files touch (D8). */
function DownstreamRow({
  group,
  label,
  isOpen,
  repoFullName,
  sha,
  onToggle,
}: {
  group: DownstreamImpact;
  label: string;
  isOpen: boolean;
  repoFullName: string | null;
  sha: string | null;
  onToggle: () => void;
}) {
  const t = useTranslations("blast");
  const bodyId = React.useId();
  const hasChips = group.endpoints_affected.length > 0 || group.crons_affected.length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        style={{ ...s.rowHeader, ...(isOpen ? s.rowHeaderOpen : undefined) }}
      >
        <Icon.ChevronRight size={13} style={{ ...s.chevron, ...(isOpen ? s.chevronOpen : undefined) }} />
        <Icon.Code size={13} style={s.symbolIcon} />
        <span className="mono" style={s.symbolName}>
          {label}
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: group.callers.length })}</span>
      </button>
      {isOpen && (
        <div id={bodyId} style={s.rowBody}>
          {group.callers.map((caller, i) => (
            <CallerRow
              key={`${caller.file}:${caller.line}:${caller.name}`}
              caller={caller}
              repoFullName={repoFullName}
              sha={sha}
              last={i === group.callers.length - 1 && !hasChips}
            />
          ))}
          {group.endpoints_affected.length > 0 && (
            <div style={s.chipsRowEndpoints}>
              {group.endpoints_affected.map((endpoint) => (
                <Badge key={endpoint} mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                  {endpoint}
                </Badge>
              ))}
            </div>
          )}
          {group.crons_affected.length > 0 && (
            <div style={s.chipsRowCrons}>
              {group.crons_affected.map((cron) => (
                <Badge key={cron} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                  {cron}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const tb = useTranslations("brief");
  const t = useTranslations("blast");
  const { data, isLoading, isError } = usePrBlast(prId);
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>
        <div style={s.skeletonStack}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={80} />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>
        <ErrorState body={t("error")} />
      </Card>
    );
  }

  const sha = data.index_sha ?? headSha;
  const hasRows = data.downstream.length > 0;

  return (
    <Card style={s.card}>
      <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>
      <div style={s.statRow}>
        <div style={s.stats}>
          <Stat icon="Code" count={data.stats.symbols} label={t("stat.symbols", { count: data.stats.symbols })} />
          <Stat
            icon="CornerDownRight"
            count={data.stats.callers}
            label={t("stat.callers", { count: data.stats.callers })}
          />
          <Stat
            icon="Globe"
            count={data.stats.endpoints}
            label={t("stat.endpoints", { count: data.stats.endpoints })}
          />
          <Stat icon="Clock" count={data.stats.crons} label={t("stat.crons", { count: data.stats.crons })} />
        </div>
        <div style={s.toggleWrap}>
          <button type="button" aria-pressed="true" style={s.toggleBtn}>
            {t("view.tree")}
          </button>
          <button type="button" disabled title={t("view.graphSoon")} style={s.toggleBtnDisabled}>
            {t("view.graph")}
          </button>
        </div>
      </div>

      {data.status === "degraded" && data.degraded_reason && (
        <p style={s.notice}>{t(`status.${data.degraded_reason}`)}</p>
      )}

      {hasRows && (
        <div style={s.tree}>
          {data.downstream.map((group, i) => {
            const isOpen = toggled[group.symbol] ?? i === 0;
            return (
              <DownstreamRow
                key={group.symbol}
                group={group}
                label={getSymbolLabel(group.symbol, data.changed_symbols)}
                isOpen={isOpen}
                repoFullName={repoFullName}
                sha={sha}
                onToggle={() => setToggled((prev) => ({ ...prev, [group.symbol]: !isOpen }))}
              />
            );
          })}
        </div>
      )}

      {!hasRows && data.status === "ok" && (
        <p style={s.noDownstream}>{t("noDownstream", { count: data.stats.symbols })}</p>
      )}

      {data.truncated && <p style={s.truncated}>{t("truncated")}</p>}
    </Card>
  );
}
