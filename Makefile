# DevDigest — common operations.
#
# Five standalone packages, NOT a workspace: pnpm in server/ and client/,
# npm in reviewer-core/, e2e/ and mcp/. The fan-out targets below encode that.

.DEFAULT_GOAL := help
.PHONY: help dev db stop check test test-it build-web typecheck lint lint-arch e2e mcp-inspect mcp-smoke

help: ## Show this help
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1;36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Boot the whole stack (Postgres -> migrate -> seed -> API + web)
	./scripts/dev.sh

db: ## Postgres + migrate + seed only, then exit
	./scripts/dev.sh --db-only

stop: ## Stop the dev servers this checkout started, then Postgres (data kept)
	./scripts/stop.sh

mcp/node_modules: mcp/package-lock.json
	cd mcp && npm ci && touch node_modules

# Everything the CI workflows run except the browser e2e lane, in the order
# that fails cheapest-first. `make e2e` is the one deliberate omission: it
# needs the agent-browser CLI and a full ephemeral stack.
#
# `build-web` is here because it is the ONLY step that catches a client change
# webpack rejects but tsc and vitest accept (see client INSIGHTS.md on
# `resolve.extensionAlias`). `test-it` self-skips when Docker is down.
#
# `build-web` SKIPS itself when a dev server owns :3000, because `next build`
# and `next dev` share `client/.next` — building underneath a running dev
# server replaces its manifests and the open page starts failing on stale
# chunks. Redirecting the build with `distDir` is NOT a fix: `next build`
# rewrites `tsconfig.json` and `next-env.d.ts` to point at whatever dist dir it
# is given, so it dirties two committed files. CI has no dev server, so there
# it always runs.
check: typecheck lint lint-arch test test-it build-web ## Everything CI runs except browser e2e (~40s)
	@printf '\033[1;32m✓ check passed\033[0m — e2e not included (make e2e)\n'

test: mcp/node_modules ## Unit lanes, no Docker (client, server, reviewer-core, mcp)
	cd client && pnpm test
	cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
	cd reviewer-core && npm test
	cd mcp && npm test

test-it: ## Server integration lane (real Postgres via testcontainers; needs Docker)
	cd server && pnpm exec vitest run .it.test

build-web: ## Production build of the web app — the lane typecheck + test miss
	@if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then \
		printf '\033[1;33m! build-web skipped\033[0m — :3000 is in use and `next build` shares client/.next with it.\n   Stop `make dev`, then re-run to cover the webpack-only lane.\n'; \
	else \
		cd client && pnpm build; \
	fi

typecheck: mcp/node_modules ## Type-check server, client, reviewer-core, mcp
	cd server && pnpm typecheck
	cd client && pnpm typecheck
	cd reviewer-core && npm run typecheck
	cd mcp && npm run typecheck

lint: ## ESLint both TypeScript packages
	cd client && pnpm exec eslint .
	cd server && pnpm exec eslint .

lint-arch: ## Check the onion-architecture boundaries (server)
	cd server && pnpm exec depcruise src

e2e: ## Hermetic browser e2e on isolated ports (ephemeral Postgres)
	./scripts/e2e.sh

INSPECTOR := npx -y @modelcontextprotocol/inspector@2.8.0
MCP_CMD   := mcp/node_modules/.bin/tsx mcp/src/index.ts
mcp-inspect: mcp/node_modules ## Open MCP Inspector on devdigest-mcp (tool calls need make dev)
	$(INSPECTOR) $(MCP_CMD)
mcp-smoke: mcp/node_modules ## Inspector CLI: list tools, call list_agents (needs make dev)
	$(INSPECTOR) --cli $(MCP_CMD) --method tools/list --format json | node -e 'const n=JSON.parse(require("fs").readFileSync(0,"utf8")).result.tools.map(t=>t.name);console.log(n.join(", "));process.exit(n.length===5?0:1)'
	$(INSPECTOR) --cli $(MCP_CMD) --method tools/call --tool-name list_agents --format json
