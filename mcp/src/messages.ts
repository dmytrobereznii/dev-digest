/**
 * The E1–E18 error templates (spec §6.7), exact text, as functions of their
 * placeholders. Nothing here decides WHEN an error fires — that lives in
 * `src/resolve.ts` (E1–E6, E9) now, and in the tools (E7, E8, E10–E18) in a
 * later slice.
 *
 * A repo `full_name` or an agent `name` is API-sourced, untrusted text (D13)
 * — every function below that takes one sanitizes it ITSELF
 * (`sanitizeUntrusted`, via `sanitizeRepo`/`sanitizeAgent` below) before
 * interpolating, rather than trusting each call site to have done it
 * already. That is what makes it true, not just documented.
 *
 * A relayed `<error>`/`<message>` is the one placeholder shape this file does
 * NOT sanitize: callers still run it through `redactSecrets` +
 * `sanitizeUntrusted(…, 500)` first (D13; see `src/redact.ts` /
 * `src/sanitize.ts` and `tools/review-result.ts`'s `sanitizeRelayedError`),
 * because that pipeline also redacts secrets, which is not this file's job.
 */
import { sanitizeUntrusted } from './sanitize.js';
import { AGENT_NAME_MAX, REPO_FULL_NAME_MAX } from './tools/constants.js';

/** A repo `full_name` echoed into an error template — untrusted API text. */
function sanitizeRepo(repo: string): string {
  return sanitizeUntrusted(repo, REPO_FULL_NAME_MAX, { singleLine: true });
}

/** An agent `name` echoed into an error template — untrusted API text. */
function sanitizeAgent(name: string): string {
  return sanitizeUntrusted(name, AGENT_NAME_MAX, { singleLine: true });
}

/** E1 — bad repo format. `x` is the (normalized) input the caller rejected —
 * caller-supplied, so it is sanitized here before being echoed. */
export function e1(x: string): string {
  const clean = sanitizeRepo(x);
  const base = `repo must be owner/name (e.g. acme/payments-api); got "${clean}".`;
  return clean.includes('/pull/')
    ? `${base} For a PR URL, pass repo=owner/name and pr_number separately.`
    : base;
}

/** E2 — repo not added to DevDigest. `known` is every `full_name` DevDigest
 * has; `x` is caller-supplied and sanitized before being echoed. */
export function e2(x: string, known: string[], webUrl: string): string {
  const list = known.length > 0 ? known.slice(0, 10).join(', ') : 'none';
  return `Repository ${sanitizeRepo(x)} is not added to DevDigest. Known: ${list}. Add it at ${webUrl}/onboarding, then retry.`;
}

/** E3 — PR not imported; read tools (no sync) hit this on a 404. */
export function e3(prNumber: number, repo: string): string {
  const r = sanitizeRepo(repo);
  return `PR #${prNumber} of ${r} has no DevDigest review (not imported). If the user wants one, call run_agent_on_pr (paid); it imports the PR first.`;
}

/** E4 — PR still not found after the sync (`run_agent_on_pr` only). */
export function e4(prNumber: number, repo: string, webUrl: string): string {
  const r = sanitizeRepo(repo);
  return `PR #${prNumber} not found for ${r}: it is not on GitHub, no GitHub token is set, or it is not among the 50 most recently updated PRs. Check with \`gh pr view ${prNumber} -R ${r}\`; set a token at ${webUrl}/settings/api-keys.`;
}

/** E5 — no agent matches. `x` is caller-supplied and sanitized before being
 * echoed. */
export function e5(x: string): string {
  return `No agent matches "${sanitizeAgent(x)}". Call list_agents for valid names.`;
}

/** E6 — ambiguous agent match. `x` is caller-supplied and sanitized before
 * being echoed. */
export function e6(x: string, names: string[]): string {
  return `"${sanitizeAgent(x)}" matches several agents: ${names.map(sanitizeAgent).join(', ')}. Pass the full name from list_agents.`;
}

/** E7 — agent disabled (checked by `run_agent_on_pr` only). */
export function e7(name: string, webUrl: string): string {
  return `Agent ${sanitizeAgent(name)} is disabled. Enable it at ${webUrl}/agents or pick another from list_agents.`;
}

/** E8 — API unreachable. */
export function e8(apiUrl: string): string {
  return `DevDigest API is not reachable at ${apiUrl}. Ask the user to start it (make dev in the DevDigest repo), then retry.`;
}

/** E9 — a 2xx response that does not match its contract (incl. a null PR id). */
export function e9(method: string, path: string): string {
  return `DevDigest returned an unexpected response for ${method} ${path}; this is a DevDigest bug, not your input. Do not retry; tell the user.`;
}

/** E10 — any other HTTP error (never used for the 429-on-POST case; see E11). */
export function e10(status: number, code: string, message: string): string {
  const base = `DevDigest API error ${status} ${code}: ${message}.`;
  return status === 429 ? base : `${base} Do not retry with the same arguments; tell the user.`;
}

/** E11 — 429 specifically on `POST /pulls/:id/review`. */
export function e11(): string {
  return "DevDigest's review rate limit (10 per minute) was hit. Wait a minute and retry, or call get_findings for a run that already exists.";
}

/** E12 — a run failed because a provider key is missing. `key` is the
 * `<KEY>_API_KEY` extracted from the run's error via
 * `/([A-Z_]+_API_KEY) is not configured/`. */
export function e12(runId: string, key: string, webUrl: string): string {
  return `Review run ${runId} failed: ${key} is not configured. Ask the user to set it at ${webUrl}/settings/api-keys, then call run_agent_on_pr again.`;
}

/** E13 — a run failed for any other reason (or none — a null `error`). */
export function e13(runId: string, error: string | null): string {
  const text = error ?? 'no message; the API may have restarted mid-run';
  return `Review run ${runId} failed: ${text}. Call run_agent_on_pr once more only if the error looks transient; otherwise tell the user.`;
}

/** E14 — the run was cancelled. */
export function e14(runId: string): string {
  return `Review run ${runId} was cancelled in DevDigest. Ask the user before starting a new one; or call get_findings with run_id=${runId} in case it finished anyway.`;
}

/** E15 — 5 consecutive polling faults while a run was in progress. */
export function e15(runId: string, repo: string, prNumber: number): string {
  const r = sanitizeRepo(repo);
  return `Lost contact with DevDigest while run ${runId} on ${r}#${prNumber} was in progress. Call get_findings with repo=${r}, pr_number=${prNumber}, run_id=${runId} once the API is back.`;
}

/** E16 — a given `run_id` is not a run on this PR at all. */
export function e16(runId: string, repo: string, prNumber: number): string {
  return `Run ${runId} is not a run on ${sanitizeRepo(repo)}#${prNumber}. Omit run_id to get the newest completed run.`;
}

/** E16 (agent variant) — the run exists on this PR, but by a different agent. */
export function e16Agent(
  runId: string,
  repo: string,
  prNumber: number,
  runAgent: string,
  agent: string,
): string {
  return `Run ${runId} on ${sanitizeRepo(repo)}#${prNumber} was made by ${sanitizeAgent(runAgent)}, not ${sanitizeAgent(agent)}. Drop agent or run_id.`;
}

/** E17 — no completed run, but an in-scope run is still running. */
export function e17Running(runId: string, agent: string, repo: string, prNumber: number): string {
  return `Run ${runId} by ${sanitizeAgent(agent)} is still running on ${sanitizeRepo(repo)}#${prNumber}; call get_findings with run_id=${runId} in about a minute.`;
}

/** E17 — no completed run at all (running variant above covers the other case). */
export function e17None(repo: string, prNumber: number, agent?: string): string {
  const suffix = agent ? ` by ${sanitizeAgent(agent)}` : '';
  return `No completed review on ${sanitizeRepo(repo)}#${prNumber}${suffix}. If the user wants one, call run_agent_on_pr (paid).`;
}

/** E18 — the run finished, but its review row was deleted. */
export function e18(runId: string): string {
  return `Run ${runId} finished, but its review was deleted in DevDigest. If the user wants a review, call run_agent_on_pr (paid).`;
}
