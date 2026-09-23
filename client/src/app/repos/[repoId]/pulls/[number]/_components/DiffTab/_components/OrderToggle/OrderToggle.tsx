/* OrderToggle — Smart order / Original order segmented control (D11). */
"use client";

import { useTranslations } from "next-intl";
import { s, btnStyle } from "./styles";

export type DiffOrder = "smart" | "original";

export function OrderToggle({
  value,
  onChange,
  smartDisabled,
}: {
  value: DiffOrder;
  onChange: (order: DiffOrder) => void;
  /** Route error → grouping isn't available; Smart is disabled (D11). */
  smartDisabled?: boolean;
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.wrap}>
      <button
        type="button"
        aria-pressed={value === "smart"}
        disabled={smartDisabled}
        onClick={() => onChange("smart")}
        style={{ ...btnStyle(value === "smart"), ...(smartDisabled ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
      >
        {t("smartDiff.smartOrder")}
      </button>
      <button
        type="button"
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
        style={btnStyle(value === "original")}
      >
        {t("smartDiff.originalOrder")}
      </button>
    </div>
  );
}
