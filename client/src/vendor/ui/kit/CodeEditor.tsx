import React from "react";
import { Icon } from "../icons";
import { Badge } from "../primitives";

/**
 * Rough token estimate: ~4 characters per token.
 *
 * The SINGLE token-estimate rule for the whole app. The skill editor's header
 * and the run trace's per-prompt-block count both call this, so the two can
 * never disagree about what a body "costs". It is an estimate — a run's real
 * token usage comes from the provider and is reported separately.
 */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

const LINE_HEIGHT = 21;
const FONT_SIZE = 12.5;
/** Gutter column width + its right padding — the text column's left offset. */
const GUTTER_WIDTH = 40;
const GUTTER_PAD = 14;

/** Per-line colour: headings accent-bold, list items secondary, rest primary. */
function lineColor(line: string): string {
  if (line.startsWith("#")) return "var(--accent-text)";
  if (line.startsWith("-") || /^\d+\./.test(line)) return "var(--text-secondary)";
  return "var(--text-primary)";
}

export interface CodeEditorProps {
  /** Controlled document text. */
  value: string;
  /** Omit (or pass `readOnly`) for a read-only viewer. */
  onChange?: (value: string) => void;
  /** Shown in the header, mono — e.g. `pr-quality-rubric.md`. */
  filename: string;
  /** Renders the `unsaved` badge in the header. */
  dirty?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  /** Accessible name for the textarea; defaults to `filename`. */
  ariaLabel?: string;
  /** Copy overrides — the kit is not internationalized, its consumers are. */
  unsavedLabel?: string;
  tokensLabel?: string;
}

/**
 * A line-numbered Markdown editor: a controlled `<textarea>` with transparent
 * text laid over a coloured, line-numbered mirror of the same content.
 *
 * It is an INPUT, not a syntax highlighter — the colouring is the three-rule
 * heuristic above, deliberately not a parser and deliberately not a dependency.
 */
export function CodeEditor({
  value,
  onChange,
  filename,
  dirty,
  readOnly,
  placeholder,
  ariaLabel,
  unsavedLabel = "unsaved",
  tokensLabel = "tokens",
}: CodeEditorProps) {
  const lines = value.split("\n");
  const tokens = estimateTokens(value);
  const editable = !readOnly && !!onChange;

  return (
    <div
      style={{
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        height: 460,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Icon.FileText size={14} style={{ color: "var(--text-muted)" }} />
        <span className="mono" style={{ fontSize: FONT_SIZE, fontWeight: 600 }}>
          {filename}
        </span>
        {dirty && <Badge color="var(--text-muted)">{unsavedLabel}</Badge>}
        <span
          className="mono tnum"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}
        >
          {`${tokens.toLocaleString()} ${tokensLabel}`}
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px 0" }}>
        <div style={{ position: "relative", minHeight: "100%" }}>
          {/* Coloured mirror. aria-hidden: the textarea carries the content. */}
          <div aria-hidden style={{ pointerEvents: "none" }}>
            {lines.map((ln, i) => (
              <div
                key={i}
                style={{ display: "flex", fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px` }}
              >
                <span
                  className="mono tnum"
                  style={{
                    width: GUTTER_WIDTH,
                    textAlign: "right",
                    paddingRight: GUTTER_PAD,
                    color: "var(--text-muted)",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="mono"
                  style={{
                    flex: 1,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    color: lineColor(ln),
                    fontWeight: ln.startsWith("#") ? 600 : 400,
                  }}
                >
                  {ln || " "}
                </span>
              </div>
            ))}
          </div>

          <textarea
            className="mono"
            aria-label={ariaLabel ?? filename}
            value={value}
            readOnly={!editable}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => onChange?.(e.target.value)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              margin: 0,
              padding: `0 0 0 ${GUTTER_WIDTH + GUTTER_PAD}px`,
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              background: "transparent",
              color: "transparent",
              caretColor: "var(--text-primary)",
              fontSize: FONT_SIZE,
              lineHeight: `${LINE_HEIGHT}px`,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            }}
          />
        </div>
      </div>
    </div>
  );
}
