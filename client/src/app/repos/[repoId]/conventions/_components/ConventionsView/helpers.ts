/** Pure helpers for the Conventions extractor page. */
import type { ConventionCandidate } from "@devdigest/shared";

/**
 * The bare repo name the design uses everywhere on this surface —
 * `payments-api`, not `acme/payments-api`. It is also the name that goes into
 * the merged skill's heading and preamble, so the two cannot disagree.
 */
export function bareRepoName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const name = fullName.split("/").pop();
  return name && name.length > 0 ? name : null;
}

/** The i18n key + count behind "last scan 1h ago". */
export interface ScanAge {
  unit: "now" | "minutes" | "hours" | "days";
  count: number;
}

/**
 * Bucket a scan timestamp into the subtitle's compact relative form. The
 * buckets are copy, not maths, so this returns the key and the number and the
 * view does the formatting — which is what keeps "1h ago" in
 * `conventions.json` instead of in a template literal.
 */
export function scanAge(iso: string | null | undefined, now: number = Date.now()): ScanAge {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(then)) return { unit: "now", count: 0 };
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return { unit: "now", count: 0 };
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.round(hours / 24) };
}

/** The accepted subset — what the toolbar counts and the modal merges. */
export function acceptedOf(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates.filter((c) => c.accepted);
}

/**
 * Whether the toolbar's toggle reads "Deselect all" rather than "Accept all".
 * An empty list is NOT "all accepted" — otherwise a repo with nothing to triage
 * would offer to deselect nothing.
 */
export function allAccepted(candidates: ConventionCandidate[]): boolean {
  return candidates.length > 0 && candidates.every((c) => c.accepted);
}
