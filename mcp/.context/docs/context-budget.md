# `/context` measurement runbook

The user runs this by hand. **Agents must not fill in the numbers.**

**Setup.** `make dev` is running and `cd mcp && npm ci` is done. Each row is a **fresh** `claude` session from the repo root; run `/context` and record both "MCP tools" and "MCP tools (deferred)" plus the total. Set `ENABLE_TOOL_SEARCH` in the shell before launching.
- Rows 1, 5a, 5b: `claude --strict-mcp-config` (row 1 with no `--mcp-config`; 5a/5b with `--mcp-config .mcp.json`), so claude.ai connectors and extensions stay out.
- Rows 2–4: `--strict-mcp-config` ignores local-scope servers, so launch plain `claude`, and in `/mcp` disable every server except `github` (claude.ai connectors and `devdigest` included). Record in Notes what `/mcp` listed.
- In every row, confirm with `/mcp` that only the row's servers are enabled.

**GitHub server and PAT hygiene.** Create a fine-grained, read-only PAT (Metadata, Contents and Pull requests: read; one repository; 1-day expiry). Read it with `read -rs PAT`, never inline. Register at local scope so it never lands in `.mcp.json`. Rows 2 and 4 (default toolsets: context, repos, issues, pull_requests, users; verified at v1.12.2):
`claude mcp add --scope local github -e GITHUB_PERSONAL_ACCESS_TOKEN="$PAT" -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server`
Row 3 (`claude mcp remove github` first):
`claude mcp add --scope local github -e GITHUB_PERSONAL_ACCESS_TOKEN="$PAT" -e GITHUB_TOOLSETS=repos,pull_requests -e GITHUB_READ_ONLY=1 -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN -e GITHUB_TOOLSETS -e GITHUB_READ_ONLY ghcr.io/github/github-mcp-server`
Afterwards: `claude mcp remove github`, `unset PAT`, and revoke the PAT. Record the PAT type in Notes; the tool list can vary with its scope.

| # | Step | Servers enabled | `ENABLE_TOOL_SEARCH` | Env | MCP tools | MCP tools (deferred) | Total | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Baseline | none | `false` | — | | | | |
| 2 | + GitHub MCP | github | `false` | default toolsets | | | | |
| 3 | Trimmed | github | `false` | `GITHUB_TOOLSETS=repos,pull_requests`, `GITHUB_READ_ONLY=1` | | | | |
| 4 | Deferred | github (untrimmed) | unset (on) | — | | | | |
| 5a | devdigest eager | devdigest | `false` | — | | | | |
| 5b | devdigest deferred | devdigest | unset (on) | — | | | | |

**Trim vs defer (the user writes this in their own words; the prompt is):** Trimming (`GITHUB_TOOLSETS`, `GITHUB_READ_ONLY`) removes tools server-side: zero tokens, uncallable, and read-only mode shrinks what an injected prompt could make the agent do. The hosted `https://api.githubcopilot.com/mcp/` ignores those env vars; it trims via a `/readonly` URL suffix or the `X-MCP-Readonly` / `X-MCP-Toolsets` headers. Deferring (Tool Search) keeps every tool callable but loads only names and server `instructions` up front, fetching a schema on search; it costs a round-trip and does nothing for the permission surface. They compose: trim what you never need, defer the rest. Explain which rows show each effect, and why 5 small tools make 5a vs 5b a small difference.
