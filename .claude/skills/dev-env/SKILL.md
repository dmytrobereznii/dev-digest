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
| Server integration lane (needs Docker) | `cd server && pnpm exec vitest run .it.test` |
| One-time `agent-browser` CLI install | `npm i -g agent-browser && agent-browser install` |
| `e2e` deps — nothing installs them | `cd e2e && npm ci` |
| Migrate or seed without booting | `cd server && pnpm db:migrate` · `pnpm db:seed` |
| Generate a migration from schema edits | `cd server && pnpm db:generate` |
| One package's dev server alone | `cd server && pnpm dev` · `cd client && pnpm dev` |
| Boot without seeding, or API-only | `./scripts/dev.sh --no-seed` · `--no-client` |

## Gotchas

- `e2e/node_modules` is absent and nothing installs it, so `make e2e` fails
  until `cd e2e && npm ci` runs once.
- **Dropping the data volume** (`docker compose down -v`) deletes
  `devdigest_pgdata` and every imported repo and review. Never run it on your
  own initiative — only when the user explicitly asks for a full reset.
  `make stop` is the safe stop.
