/* Pure URL-state helpers for the PR detail route (D15). */
import type { DiffTarget } from "@/components/diff-viewer";

/** Query param names carrying the Files changed target. */
const FILE_PARAM = "file";
const LINE_PARAM = "line";

/** Query for opening Files changed on a file and line; other params are kept. */
export function focusTargetQuery(search: URLSearchParams, file: string, line: number): URLSearchParams {
  const sp = new URLSearchParams(search.toString());
  sp.set("tab", "diff");
  sp.set(FILE_PARAM, file);
  sp.set(LINE_PARAM, String(line));
  return sp;
}

/** Query for switching tab: sets `tab` and drops the file and line target. */
export function getTabChangeQuery(search: URLSearchParams, tab: string): URLSearchParams {
  const sp = new URLSearchParams(search.toString());
  sp.set("tab", tab);
  sp.delete(FILE_PARAM);
  sp.delete(LINE_PARAM);
  return sp;
}

/** Reads the target from the URL; a missing or invalid line is null. */
export function parseDiffTarget(search: Pick<URLSearchParams, "get">): DiffTarget | null {
  const file = search.get(FILE_PARAM);
  if (!file) return null;
  const raw = search.get(LINE_PARAM);
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return { file, line: Number.isSafeInteger(n) && n > 0 ? n : null };
}
