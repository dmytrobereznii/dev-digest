/** "8.2K→1.3K" — the design's token pair under the PR score (findings.jsx). */
export function formatTokenPair(tokensIn: number, tokensOut: number): string {
  const k = (n: number) => `${(n / 1000).toFixed(1)}K`;
  return `${k(tokensIn)}→${k(tokensOut)}`;
}
