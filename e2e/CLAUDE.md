# `@devdigest/e2e` — deterministic browser suite

How a flow works, env knobs and the coverage table:
[`README.md`](README.md)

Package manager is **npm**. Driven by Vercel **agent-browser** (Rust + CDP) —
no Playwright, no LLM, no API key.

## Run it hermetically

`make e2e` boots an isolated, freshly-seeded stack on alternate ports (Postgres
`:5433`, API `:3101`, web `:3100`) and tears it down after. It is safe to run
while your normal dev stack is up.

**Known gap:** `scripts/e2e.sh` installs deps for the pnpm packages and
`reviewer-core`, but never for `e2e/` itself, so `make e2e` fails until this
package's deps are installed once. Root `typecheck` excludes `e2e` for the same
reason. The install command is in the `dev-env` skill.

Running the flows against your own dev stack instead is **only** safe if that DB
contains nothing but the seeded demo repo — flows `02`/`04`/`05` follow the home
redirect to the *first* repo, so any extra imported repo makes them land on the
wrong one and fail. Prefer `make e2e`.

> **Never drop the `devdigest_pgdata` volume to reset the dev DB.** It takes
> every real repo and review you have imported with it. The hermetic stack
> exists precisely so you never need to.

## Writing a flow

A spec is `specs/NN-name.flow.json`: a name plus an ordered list of steps, each
a `cmd` array passed verbatim to `agent-browser`, with a human `label`.

- **`wait` steps are the assertions.** A non-zero exit fails the step and the
  flow, so `wait --text` / `wait --url` time out and fail if the condition never
  holds. Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check.
- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
  **Never the AI `chat` command**: it makes runs unstable and needs a key.
- `{BASE}` is substituted with `E2E_BASE_URL` (default `http://localhost:3000`).
- **Target read-only seeded data** (demo repo `acme/payments-api`, PR #482, the
  seeded agents) so no flow ever triggers a model call.

Numbering is sequential and flows run in order against one shared browser
session, so a new flow normally appends rather than inserts.

## Note on `specs/`

This package's `specs/` holds **test flows** and predates the convention. Design
and change specs go in `.context/specs/` like every other package — do not mix
the two.

Failure screenshots land in `test-results/` (git-ignored, uploaded as a CI
artifact by `.github/workflows/e2e-web.yml`).

## `.context/`

`docs/` reference · `specs/` planned changes · `insights/INSIGHTS.md` committed
findings, read and appended by the `engineering-insights` skill.
