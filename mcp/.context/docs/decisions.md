# Decisions

Settled design decisions carried over from spec 09 (`devdigest-mcp`), which is
deleted on merge per the root `CLAUDE.md`. `mcp/CLAUDE.md`, `mcp/README.md`
and `.github/workflows/mcp.yml` cite these IDs; this file is where they now
live.

### D2 — A thin HTTP client of the API; the API is the permission boundary
`src/api/client.ts` exposes named methods only, one per endpoint — no generic
`request(path)` export. The MCP never imports server internals or opens a DB
connection. Workspace scoping, rate limits and provider keys stay in the API,
so a narrow client limits capability in code, not by `readOnlyHint` alone.

### D3 — Own slim Zod parsers at runtime, plus a type-only compatibility check
`src/api/schemas.ts` declares response parsers that list only the fields the
MCP reads. `src/api/contract-compat.ts` holds `import type`-only assertions
(`Server extends z.input<Slim>`) against the server's shared contracts, so
every slim field copies the server field's type and nullability exactly, and
a contract change fails `npm run typecheck` in `mcp/` instead of drifting
silently at runtime. Nothing here imports the shared contracts at runtime.

### D12 — `DEVDIGEST_API_URL` must be a bare loopback origin
`loadConfig` requires `http:`/`https:`, a hostname of `127.0.0.1`, `[::1]` or
`localhost`, and no userinfo/query/hash/path; anything else refuses to start
with one stderr line and exit 1. Every request also passes `redirect: 'error'`.
This guards against env mistakes (a typo, a pasted remote URL), not a
malicious PR — see D16 for that half.

### D13 — Untrusted text is sanitized and labelled as data; relayed errors are redacted
`src/sanitize.ts` (`sanitizeUntrusted`) strips control/invisible characters
and bidi overrides, defangs markdown image/anchor markup, and caps length.
`src/redact.ts` masks known secret shapes and URL userinfo. A relayed API or
run error is redacted first, then sanitized, then capped. Tool instructions
and descriptions tell the model to treat this text as data, never as
instructions.

### D15 — Tools advertise no `outputSchema`
`registerTool` gets no `outputSchema`, because the SDK emits draft-07 JSON
Schema and Claude Code 2.1.282 rejects it. A success result still carries
`structuredContent`; the Zod output schemas in `src/tools/schemas.ts` exist
only so tests can assert `Schema.parse(result.structuredContent)`.

### D16 — `.mcp.json` launches from the git top level and is guarded in CI
The launcher `cd`s to `$(git rev-parse --show-toplevel)/mcp` before running
`tsx`, because the server's cwd is undocumented and `${CLAUDE_PROJECT_DIR}` is
not reliably set. `mcp/scripts/check-mcp-json.mjs` asserts the exact command,
args and allowed env keys, and `mcp.yml` runs it on every change to
`.mcp.json`. This is the control against a PR that quietly rewrites the
launcher; loopback-only (D12) does not cover that case.
