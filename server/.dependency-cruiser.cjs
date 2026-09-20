/**
 * Onion-architecture boundaries for `@devdigest/api`, as lint rules.
 *
 * The prose version — the ring model, the reasoning, and what to do when a
 * rule fires — lives in `.claude/skills/onion-architecture/SKILL.md`.
 *
 * Run from `server/`:
 *
 *     pnpm exec depcruise src
 *
 * `dependency-cruiser` is already a runtime dependency (the repo-intel
 * import-graph adapter uses it), so this config adds no new package.
 *
 * Dependencies point INWARD:
 *
 *     routes.ts ─▶ service.ts ─▶ repository.ts ─▶ db/
 *         │            │
 *         │            └──▶ ports (vendor/shared/adapters.ts) ◀── adapters/
 *         └──────────────▶ contracts (vendor/shared/contracts/) ◀── everything
 *
 * Only the composition root (`platform/container.ts`, `app.ts`) is allowed to
 * know both a port and its concrete implementation.
 */

/** SDKs that reach the outside world. Legal only under `src/adapters/`. */
/*
 * Matched against the RESOLVED path, which under pnpm is
 * `node_modules/.pnpm/openai@x.y.z/node_modules/openai/…` — hence the
 * `node_modules/` prefix rather than a `^` anchor on the package name.
 */
const EXTERNAL_SDKS =
  'node_modules/(openai|@anthropic-ai/|octokit|@octokit/|simple-git|@ast-grep/|@vscode/ripgrep)';

/**
 * Pre-existing debt, recorded 2026-09-20: these four route files query Drizzle
 * directly, with no service or repository behind them. They are exempt so the
 * rule can be an error for everything else. Do not add to this list — shrink
 * it. See SKILL.md § "Known exceptions".
 */
const LEGACY_SQL_ROUTES = [
  '^src/modules/pulls/routes\\.ts$',
  '^src/modules/settings/routes\\.ts$',
  '^src/modules/polling/routes\\.ts$',
  '^src/modules/workspace/routes\\.ts$',
];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'A cycle means two modules are really one. Extract the shared piece inward ' +
        '(a contract, a port, or a helper) rather than importing sideways. Warn, not ' +
        'error, because two cycles predate this config: repo-intel/service ↔ ' +
        'platform/container (the service takes the whole Container, which constructs ' +
        'the service — inject the ports it actually needs instead), and ' +
        'agents/helpers ↔ agents/repository.',
      from: {},
      to: { circular: true },
    },

    {
      name: 'sdk-outside-adapters',
      severity: 'error',
      comment:
        'Vendor SDKs are the outermost ring. Put the call behind an interface in ' +
        'vendor/shared/adapters.ts and an implementation in src/adapters/<name>/, ' +
        'then resolve it from the container.',
      from: { path: '^src/', pathNot: '^src/adapters/' },
      to: { dependencyTypes: ['npm'], path: EXTERNAL_SDKS },
    },

    {
      name: 'sql-in-routes',
      severity: 'error',
      comment:
        'A route is an HTTP adapter: validate, call one service method, map the ' +
        'result. Move the query into the module repository.',
      from: {
        path: '^src/modules/[^/]+/routes\\.ts$',
        pathNot: LEGACY_SQL_ROUTES,
      },
      to: { path: ['node_modules/drizzle-orm/', '^src/db/(schema|client)'] },
    },

    {
      name: 'routes-skip-service',
      severity: 'error',
      comment:
        'Routes talk to the service, never straight to the data layer. If the ' +
        'service method would be a one-liner, write the one-liner.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/modules/[^/]+/repository(\\.ts|/)' },
    },

    {
      name: 'persistence-in-service',
      severity: 'warn',
      comment:
        'Row types and schema tables are persistence detail. A service should ' +
        'speak contracts and DTOs; map rows at the repository edge.',
      from: {
        path: '^src/modules/',
        pathNot: '^src/modules/[^/]+/repository(\\.ts|/)',
      },
      to: { path: '^src/db/' },
    },

    {
      name: 'io-adapter-in-module',
      severity: 'error',
      comment:
        'Adapters that hold credentials or perform I/O are reached through a port ' +
        'off the container, never imported by name. (Pure helpers under ' +
        'adapters/ — diff-parser, extract, astgrep — are fine.)',
      from: { path: '^src/modules/' },
      to: {
        path: '^src/adapters/(llm|github|secrets|auth|embedder)/|^src/adapters/git/simple-git',
      },
    },

    {
      name: 'contracts-stay-pure',
      severity: 'error',
      comment:
        'The innermost ring. Zod and sibling contracts only — no ports, no ' +
        'adapters, no Node builtins.',
      from: { path: '^src/vendor/shared/contracts/' },
      to: {
        pathNot: ['^src/vendor/shared/contracts/', 'node_modules/zod/'],
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'ports-know-no-implementations',
      severity: 'error',
      comment:
        'vendor/shared declares the contract; it must never reach outward to the ' +
        'code that satisfies it. This is the dependency inversion, in one rule.',
      from: { path: '^src/vendor/shared/' },
      to: { path: '^src/(adapters|db|modules|platform)/' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '(\\.test\\.ts$|^src/db/migrations/)' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
