/**
 * Smart Diff — path→role classification rules (spec 08 §4, D2/D3). PURE and
 * path-only: no glob library, anchored RegExps against a normalized POSIX
 * path (see `classify.ts`).
 */

import type { SmartDiffRole } from '@devdigest/shared';

/** One role's ordered pattern set. `patterns` are tested in array order, but
 * `classifyFile` only cares whether ANY pattern in the role matches. */
export interface RoleRule {
  readonly role: SmartDiffRole;
  readonly patterns: readonly RegExp[];
}

/**
 * D2 — match order (first role with a matching pattern wins): boilerplate →
 * tests → wiring → docs. `core` is not listed: it is `classifyFile`'s
 * fallback when nothing else matches, not a pattern match.
 */
export const ROLE_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      // *.lock — yarn.lock, Cargo.lock, poetry.lock, Gemfile.lock, composer.lock.
      /\.lock$/,
      // pnpm's lockfile (not *.lock).
      /(^|\/)pnpm-lock\.yaml$/,
      // npm's lockfile.
      /(^|\/)package-lock\.json$/,
      // npm's legacy shrinkwrap lockfile.
      /(^|\/)npm-shrinkwrap\.json$/,
      // bun's binary lockfile.
      /(^|\/)bun\.lockb$/,
      // build output directories, at any depth.
      /(^|\/)(dist|build)\//,
      // snapshot-test directories, at any depth.
      /(^|\/)__snapshots__\//,
      // individual snapshot files (redundant with the dir rule above, but
      // catches a .snap file outside __snapshots__/).
      /\.snap$/,
      // machine-generated files.
      /\.generated\.[^./]+$/,
      // minified JS/CSS bundles.
      /\.min\.(js|css)$/,
      // drizzle's migration journal + snapshots.
      /(^|\/)migrations\/meta\//,
    ],
  },
  {
    role: 'tests',
    patterns: [
      // *.test.* / *.spec.* across every JS/TS extension; the suffix match
      // also covers *.it.test.ts (e.g. foo.it.test.ts ends in .test.ts).
      /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/,
      // conventional test directories, at any depth — also covers a file
      // with no test/spec extension that merely lives under one of them.
      /(^|\/)(test|tests|__tests__|e2e)\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      // barrel files — index.tsx is excluded on purpose (a component here).
      /(^|\/)index\.(ts|js|mjs|cjs)$/,
      // any *.config.* file (vite.config.ts, jest.config.js, ...).
      /\.config\.[^./]+$/,
      // a bare config.{ts,js,mjs,cjs} — D2 deviation from the brief.
      /(^|\/)config\.(ts|js|mjs|cjs)$/,
      // package manifest — D2 deviation: not boilerplate, so a new
      // dependency can't hide in a collapsed group.
      /(^|\/)package\.json$/,
      // tsconfig*.json (tsconfig.json, tsconfig.base.json, ...).
      /(^|\/)tsconfig[^/]*\.json$/,
      // ESLint legacy config.
      /(^|\/)\.eslintrc[^/]*$/,
      // dotenv files (.env, .env.example, .env.local, ...).
      /(^|\/)\.env[^/]*$/,
      // docker-compose*.yml / .yaml.
      /(^|\/)docker-compose[^/]*\.ya?ml$/,
      // Dockerfile / Dockerfile.dev / ...
      /(^|\/)Dockerfile[^/]*$/,
      // Makefile.
      /(^|\/)Makefile$/,
      // misc root-ish tooling dotfiles.
      /(^|\/)\.gitignore$/,
      /(^|\/)\.npmrc$/,
      /(^|\/)\.nvmrc$/,
      /(^|\/)\.prettierrc[^/]*$/,
      /(^|\/)\.editorconfig$/,
      // repo-root GitHub config (workflows, CODEOWNERS, ...) — rooted, so a
      // nested .github/ elsewhere would not match.
      /^\.github\//,
      // repo-root Claude Code config (agents, skills, settings) — rooted,
      // checked before the docs *.md rule so *.claude/**/*.md stays wiring.
      /^\.claude\//,
    ],
  },
  {
    role: 'docs',
    patterns: [
      // prose/reference extensions.
      /\.(md|mdx|rst|adoc)$/,
      // a docs/ directory, at any depth — wins even for a non-doc extension.
      /(^|\/)docs\//,
      // README/CHANGELOG/LICENSE/CONTRIBUTING, any casing, any extension.
      /(^|\/)README[^/]*$/i,
      /(^|\/)CHANGELOG[^/]*$/i,
      /(^|\/)LICENSE[^/]*$/i,
      /(^|\/)CONTRIBUTING[^/]*$/i,
    ],
  },
];

/**
 * D3 — the display order, independent of the D2 match order above. Literal
 * (not derived from `SmartDiffRole.options`) so T1 genuinely guards drift
 * between this list and the shared contract's enum declaration order.
 */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
