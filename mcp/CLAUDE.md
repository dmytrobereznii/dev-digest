# `@devdigest/mcp` — local stdio MCP server

What it is and the 5 tools: [`README.md`](README.md).

Package manager is **npm** (`package-lock.json`), not pnpm. Run from `mcp/`.

## No emit

`typecheck` is `tsc --noEmit`; there is no `build` script and no `dist/`.
`start` runs the TypeScript source directly under `tsx`.

## Nothing writes to stdout

stdio is the MCP transport: a stray `console.log` or `process.stdout.write`
corrupts every message on the wire. Diagnostics go to `console.error`
(stderr) only — `test/stdio.test.ts` spawns the real entry point to catch it.

## The narrow-client rule (decisions.md D2)

`src/api/client.ts` is the only place that talks to the DevDigest API, and it
exposes named methods only — no generic `request(path)` export. The API is
the permission boundary (workspace scoping, rate limits, provider keys); this
package never imports server internals and never opens a DB connection.

## No `outputSchema` (decisions.md D15)

Tools register via `registerTool(name, {...}, handler)` with **no**
`outputSchema` — the SDK emits draft-07 JSON Schema, which Claude Code 2.1.282
rejects. A success result still carries `structuredContent`, checked in tests
against the Zod schemas in `src/tools/schemas.ts`.

## Tool descriptions have a size budget

Instructions and per-tool descriptions are capped and enforced by
`test/tools-list.test.ts` — check that test before growing one.

## `.context/`

`docs/` reference (incl. `decisions.md`, spec 09's decisions carried over
after the spec's own deletion) · `specs/` planned changes ·
`insights/INSIGHTS.md` committed findings, read and appended by the
`engineering-insights` skill.
