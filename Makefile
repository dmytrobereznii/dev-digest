# DevDigest — common operations.
#
# Four standalone packages, NOT a workspace: pnpm in server/ and client/,
# npm in reviewer-core/ and e2e/. The fan-out targets below encode that.

.DEFAULT_GOAL := help
.PHONY: help dev db stop test typecheck e2e

help: ## Show this help
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1;36m%-10s\033[0m %s\n", $$1, $$2}'

dev: ## Boot the whole stack (Postgres -> migrate -> seed -> API + web)
	./scripts/dev.sh

db: ## Postgres + migrate + seed only, then exit
	./scripts/dev.sh --db-only

stop: ## Stop Postgres, keeping the container and the data volume
	docker compose stop

test: ## Unit lanes, no Docker (client, server, reviewer-core)
	cd client && pnpm test
	cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
	cd reviewer-core && npm test

typecheck: ## Type-check server, client, reviewer-core
	cd server && pnpm typecheck
	cd client && pnpm typecheck
	cd reviewer-core && npm run typecheck

e2e: ## Hermetic browser e2e on isolated ports (ephemeral Postgres)
	./scripts/e2e.sh
