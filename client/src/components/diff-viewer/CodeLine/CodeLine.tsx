/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { type LineAnnotation } from "../annotations";
import { s, targetLineStyle, lineRowFor, lineSignFor, markerBarStyle, markerPillStyle } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  annotations,
  commenting,
  isTarget,
  scrollToTarget = true,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  annotations: LineAnnotation[];
  commenting?: DiffCommentApi;
  /** This is the line a navigation targeted: mark it and scroll it into view. */
  isTarget?: boolean;
  /** False once the target has already scrolled: the mark stays, the scroll does not repeat. */
  scrollToTarget?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isTarget && scrollToTarget) rowRef.current?.scrollIntoView?.({ block: "center" });
  }, [isTarget, scrollToTarget]);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  // Several annotations can share a row (D9); the first that carries a
  // marker sets the bar/pill, but every annotation's node renders below.
  const marker = annotations.find((a) => a.marker)?.marker ?? null;
  const MarkerIcon = marker ? Icon[marker.icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={rowRef}
        aria-current={isTarget ? "true" : undefined}
        style={{ ...lineRowFor(ln.kind), position: "relative", ...(isTarget ? targetLineStyle : null) }}
      >
        {marker && <div data-testid="line-marker-bar" style={markerBarStyle(marker.color)} />}
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {marker && (
          <span style={markerPillStyle(marker.color, marker.bg)} title={marker.label}>
            {MarkerIcon && <MarkerIcon size={11} />}
            {marker.label}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {annotations
        .filter((a) => a.node != null)
        .map((a) => (
          <div key={a.id} style={cs.thread}>
            {a.node}
          </div>
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
