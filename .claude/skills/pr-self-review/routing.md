# Routing — diff → skills → checks

Hand-maintained on purpose: skill `description` frontmatter is prose, and these
globs have to be exact. One row per zone; a file matching two rows gets both.

Paths are repo-relative. `make` targets come from
[`dev-env`](../dev-env/SKILL.md): use `make typecheck` / `make test` when two or
more packages changed, the package's own command when one did.

## Skill routes

| Changed path | Skills to load | Mechanical checks |
|---|---|---|
| `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/**` | [`onion-architecture`](../onion-architecture/SKILL.md), [`typescript-expert`](../typescript-expert/SKILL.md) | `cd server && pnpm exec depcruise src` · `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| `server/src/modules/*/routes.ts` | + [`fastify-best-practices`](../fastify-best-practices/SKILL.md) | `grep -ln 'drizzle-orm\|db/schema' server/src/modules/*/routes.ts` (four files are exempt by name — see the skill) |
| `server/src/db/schema/**` | [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md), [`postgresql-table-design`](../postgresql-table-design/SKILL.md) | schema changed with **no** new file under `db/migrations/` → `CRITICAL`: run `pnpm db:generate` |
| `server/src/db/migrations/**` | — owned zone | any edit to an **existing** migration or to `meta/_journal.json` → `CRITICAL` |
| `server/src/modules/*/repository.ts` | + `drizzle-orm-patterns` | covered by `depcruise` |
| `client/src/app/**`, `client/src/components/**`, `client/src/lib/**` | [`frontend-architecture`](../frontend-architecture/SKILL.md), [`react-best-practices`](../react-best-practices/SKILL.md), [`next-best-practices`](../next-best-practices/SKILL.md) | `cd client && pnpm typecheck && pnpm test` · the four greps below |
| `client/**/*.test.tsx`, `client/src/test/**` | [`react-testing-library`](../react-testing-library/SKILL.md) | `cd client && pnpm test` |
| `client/messages/**` | — | keys camelCase, nested per feature file; a new key in `en/` missing from a sibling locale → `WARNING` |
| `client/src/vendor/shared/**`, `server/src/vendor/shared/**` | [`zod`](../zod/SKILL.md), `onion-architecture` | `diff -r client/src/vendor/shared server/src/vendor/shared` — **the two-copy rule** |
| `client/src/vendor/ui/**` | — | `client/src/vendor/ui/README.md` read first; otherwise `WARNING` |
| `reviewer-core/src/**` | `onion-architecture` (ring 1 — engine), `zod` | `cd reviewer-core && npm run typecheck && npm test` · no `node:*`, `fs`, or direct network import |
| `e2e/specs/*.flow.json`, `e2e/src/**` | — | each file parses as JSON · named `NN-kebab.flow.json`, sequential · **no AI `chat` command** |
| settings, tokens, env reads, file writes, uploads, auth; `server/src/modules/settings/**` | [`security`](../security/SKILL.md) | secret scan over the diff (below) |
| `Makefile`, `scripts/**`, `docker-compose.yml`, `.github/**` | [`dev-env`](../dev-env/SKILL.md) | `make help` still lists every target |
| `*.md`, `*/.context/**` | [`engineering-insights`](../engineering-insights/SKILL.md), [`design-reference`](../design-reference/SKILL.md) | a spec whose work is merged is still present → `WARNING` (specs are deleted on merge) |
| `.claude/skills/**` | — | `SKILL.md` has `name` + `description` frontmatter · listed in `.claude/skills/README.md` |

## Always-on — the `CLAUDE.md` rules no skill owns

These run on every invocation regardless of what changed. Each is `CRITICAL`
unless marked otherwise.

| Rule | Check |
|---|---|
| Wrong package manager | `package-lock.json` under `server/` or `client/`, or `pnpm-lock.yaml` under `reviewer-core/` or `e2e/` — a stray lockfile is deleted, never committed |
| Lockfile without a reason | a lockfile in the diff with no `package.json` dependency change beside it |
| Runtime data | anything under `server/clones/**` |
| Integration-test suffix | a test importing `test/helpers/pg.ts` without the `.it.test.ts` suffix — it would run in the no-Docker lane |
| Contract drift | a file changed in one `vendor/shared` copy and not the other |
| Naming (`WARNING`) | component folder + file PascalCase under `_components/`; support files exactly `helpers.ts` `constants.ts` `styles.ts` `index.ts`; server module folders kebab-case with `routes.ts` `service.ts` `repository.ts`; API JSON fields `snake_case`; i18n keys camelCase; specs `NN-kebab-slug.md` |
| Commit subjects (`WARNING`) | every subject in `git log --format=%s $BASE..HEAD` matches `type(area): summary` |
| Secrets | a key, token or `.env` value in the diff |

Commands:

```sh
# stray lockfiles
ls server/package-lock.json client/package-lock.json \
   reviewer-core/pnpm-lock.yaml e2e/pnpm-lock.yaml 2>/dev/null

# the two-copy rule
diff -r client/src/vendor/shared server/src/vendor/shared

# integration-test suffix
grep -rl "helpers/pg" server --include='*.test.ts' | grep -v '\.it\.test\.ts$'

# commit subjects
git log --format='%s' "$BASE"..HEAD | grep -vE '^[a-z]+(\([a-z0-9.-]+\))?!?: .+'

# secrets, over the diff only
git diff "$BASE" | grep -nE '^\+.*(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|API_KEY[[:space:]]*=[[:space:]]*["'"'"'][^"'"'"']+)'
```

## Client convention greps

From `frontend-architecture` § Enforcement — what `client/eslint.config.mjs`
cannot express. Run `make lint` first; then these, from `client/src`:

```sh
grep -rn --include='*.tsx' 'fetch(' app components | grep -v '/lib/'   # 0 expected
grep -rn --include='*.ts*' -E 'from "(\.\./){3,}' .                    # deep relative imports
grep -rl 'export \*' --include='index.ts' . | xargs grep -l 'export { default' 2>/dev/null
```

A hit is a `WARNING` **only when the diff introduced it** — all three have a
standing baseline listed in that skill's *Known exceptions* table.

## Baselines — a finding is a delta, not a count

| Check | Baseline, 2026-09-20 |
|---|---|
| `depcruise src` | 0 errors, 15 warnings |
| `"use client"` files | 53 |
| deep relative imports | 51, against 20 `@/` imports |
| `export *` barrels | 3 (`app-shell`, `showcase`, `page-shell`) |
| `sql-in-routes` exemptions | `pulls`, `settings`, `polling`, `workspace` — that list shrinks, never grows |

Re-measure a baseline only when the user asks. A number that moved **up**
because of this diff is the finding.
