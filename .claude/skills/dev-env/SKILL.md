---
name: dev-env
description: >-
  Makefile targets are the interface to DevDigest's local environment; `make
  help` lists them. Use when starting or stopping the stack, the database,
  tests, typecheck, or e2e. Covers the case where no target fits: run it raw,
  then propose paving it in.
---

# dev-env

`make help` is the catalog. Read it, then reach for a target over the command
it wraps. Targets run from the repo root.

## When no target fits

**Pave the cowpath**, in order:

1. Say it in one line: *"No target covers X."*
2. Run the raw command, so the work still lands.
3. For a path you would walk again, propose the target as a diff, and write it
   once the user accepts:

```make
migrate: ## Apply pending migrations without booting the stack
	cd server && pnpm db:migrate
```

Repetition earns a target, and so does encoding something easy to get wrong. A
path walked once stays raw.

## No target, on purpose

The docs point here for these rather than spelling them out:

| Need | Command |
|---|---|
| One-time `agent-browser` CLI install | `npm i -g agent-browser && agent-browser install` |
| `e2e` deps — nothing installs them | `cd e2e && npm ci` |
| Migrate or seed without booting | `cd server && pnpm db:migrate` · `pnpm db:seed` |
| Generate a migration from schema edits | `cd server && pnpm db:generate` |
| One package's dev server alone | `cd server && pnpm dev` · `cd client && pnpm dev` |
| Boot without seeding, or API-only | `./scripts/dev.sh --no-seed` · `--no-client` |

## `make check` is the pre-PR gate

`check` = `typecheck` + `lint` + `lint-arch` + `test` + `test-it` +
`build-web`, cheapest-first, ~30s. It is every CI workflow except the browser
e2e lane, so a green `check` is what "CI will pass" means locally.

Two members of that list are easy to drop and are the whole point of the
target: `build-web`, because `next build` rejects client code that `tsc` and
`vitest` accept (client `INSIGHTS.md` → `resolve.extensionAlias`), and
`test-it`, which self-skips when Docker is down rather than failing.

**`build-web` skips itself while `make dev` is up**, and says so in yellow.
`next build` and `next dev` share `client/.next`, so building underneath a
running dev server swaps its manifests and the open page starts failing on
stale chunks. To actually cover that lane, stop `make dev` first. Do not
"fix" the skip by pointing the build at another `distDir`: `next build`
rewrites `tsconfig.json` and `next-env.d.ts` to match whatever dist dir it is
given, so that trades a runtime clash for two dirty committed files.

Current clean baselines — a `check` that reports these is green, not dirty:
client **0 errors / 52 warnings**, server **0 / 0**, `depcruise`
**0 errors / 16 warnings**.

## Gotchas

- `e2e/node_modules` is absent and nothing installs it, so `make e2e` fails
  until `cd e2e && npm ci` runs once.
- **Dropping the data volume** (`docker compose down -v`) deletes
  `devdigest_pgdata` and every imported repo and review. Never run it on your
  own initiative — only when the user explicitly asks for a full reset.
  `make stop` is the safe stop.

- **`make stop` is PID-based, and that is deliberate.** It reaps only the
  trees `dev.sh` recorded in `.dev-pids`, then stops Postgres; anything else
  holding :3000/:3001 is reported and left alone, because this repo is often
  driven by more than one session at once. Do not "improve" it into
  `kill $(lsof -t -i:3000)` — that reaches into another session's stack.
  `./scripts/stop.sh --keep-db` stops the servers without touching Postgres.

- **Killing a dev server needs the whole tree.** `pnpm dev` spawns the real
  listener as a GRANDCHILD (`pnpm` → `tsx watch` → `node`), so `kill $PID` on
  the wrapper orphans the listener: it reparents to init and holds its port
  forever. `dev.sh`, `stop.sh` and `e2e.sh` each carry the same leaves-first
  `kill_tree` helper — keep them in sync. Symptom of the old bug: several
  `tsx watch src/server.ts` with `PPID 1`, only one of which owns :3001.
