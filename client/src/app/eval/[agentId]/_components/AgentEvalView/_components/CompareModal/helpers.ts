export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/**
 * Line diff of two texts by longest common subsequence. Lines only in `older`
 * come out `removed`, lines only in `newer` come out `added`, in order; on a
 * replaced line the removal precedes the addition.
 */
export function diffLines(older: string, newer: string): DiffLine[] {
  const a = older.split("\n");
  const b = newer.split("\n");
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "removed", text: a[i++]! });
    } else {
      out.push({ kind: "added", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) out.push({ kind: "added", text: b[j++]! });
  return out;
}

/** Counts of case ids present in only one of the two result sets. */
export function caseSetDifference(
  olderIds: string[],
  newerIds: string[],
): { onlyOlder: number; onlyNewer: number } {
  const o = new Set(olderIds);
  const n = new Set(newerIds);
  return {
    onlyOlder: olderIds.filter((id) => !n.has(id)).length,
    onlyNewer: newerIds.filter((id) => !o.has(id)).length,
  };
}

/** USD for a cost cell, four decimals as in the runs table. */
export function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}
