import tseslint from "typescript-eslint";

/**
 * ESLint for the API. Flat config, `typescript-eslint` only — there is no
 * React here.
 *
 * Deliberately thin. The onion rings are owned by `.dependency-cruiser.cjs`
 * (`make lint-arch`) and are NOT duplicated here: one source of truth per
 * boundary. What is left is the class of bug neither the type-checker nor
 * `depcruise` can see — a dropped promise, and a `process.env` read that
 * bypasses the SecretsProvider chokepoint.
 *
 * `no-floating-promises` is type-aware, so the config points at
 * `tsconfig.json`; that is why the lane is a separate CI step rather than part
 * of the test job.
 *
 * A rule is `error` only where the tree already satisfies it, so the first
 * green build is an honest one.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      // Runtime data written by the server, and generated SQL owned by
      // drizzle-kit (CLAUDE.md → Do not touch).
      "clones/**",
      "src/db/migrations/**",
      // Vendored: the Zod contracts are owned elsewhere and duplicated into
      // client/src/vendor/shared (see the two-copy rule in CLAUDE.md).
      "src/vendor/**",
    ],
  },

  // Type-aware parsing for the whole of src/, with no rule set pulled in:
  // `recommended` would report hundreds of pre-existing findings that this
  // spec has no mandate to fix.
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Await-driven job and SSE paths are everywhere here; a dropped promise
      // on one of them fails silently.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // platform/config.ts documents that the SecretsProvider is "the one
  // chokepoint that reads process.env directly". That invariant was a comment;
  // this makes it mechanical. Scoped to the application rings — the standalone
  // db/ scripts and the git adapter's GIT_TERMINAL_PROMPT writes are
  // legitimate reads outside them, and stay untouched.
  {
    files: ["src/modules/**/*.ts", "src/platform/**/*.ts"],
    ignores: ["src/platform/config.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Read configuration through platform/config.ts or the SecretsProvider — it is the one chokepoint that reads process.env directly.",
        },
      ],
    },
  },
);
