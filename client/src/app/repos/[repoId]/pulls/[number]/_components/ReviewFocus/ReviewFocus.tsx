/* ReviewFocus — full-width "read these first" block below the brief grid.
   One row per entry: a button with `file:line`, then the reason. All model
   strings are plain text children (NFR-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  onOpen?: (file: string, line: number) => void;
}

export function ReviewFocus({ items, onOpen }: ReviewFocusProps) {
  const t = useTranslations("brief");
  return (
    <Card>
      <SectionLabel icon="ListChecks">
        {t("focus.title")}
        <span style={s.count}>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {t("focus.count", { count: items.length })}
          </Badge>
        </span>
      </SectionLabel>
      {items.length === 0 ? (
        <p style={s.none}>{t("focus.empty")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => {
            const ref = `${item.file}:${item.line}`;
            return (
              <li key={i} style={s.item}>
                <span aria-hidden="true" style={s.bullet} />
                <button
                  type="button"
                  className="mono"
                  style={s.pathButton}
                  title={ref}
                  onClick={() => onOpen?.(item.file, item.line)}
                >
                  {ref}
                </button>
                <span aria-hidden="true">—</span>
                <span style={s.reason}>{item.reason}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
