import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/**
 * ESLint for the web app. Flat config, on top of `eslint-config-next`.
 *
 * Scope is what a type-checker cannot see: hook dependency arrays, the
 * server/client seam, and the two placement rules from `frontend-architecture`
 * that are cheap to express here. Architectural boundaries are NOT duplicated
 * from `server/.dependency-cruiser.cjs` — one source of truth per boundary.
 *
 * A rule is `error` only where the tree already satisfies it; the accepted debt
 * in `frontend-architecture` § Known exceptions stays `warn` so the first green
 * build is an honest one.
 */
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Vendored: the design system and the Zod contracts are owned elsewhere
      // (see src/vendor/ui/README.md and the two-copy rule in CLAUDE.md).
      "src/vendor/**",
    ],
  },
  {
    rules: {
      // react-best-practices — the class of bug a type-checker cannot see.
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",

      // frontend-architecture § Copy: every user-visible string goes through
      // next-intl, and a native dialog can be neither translated nor tested.
      // The app already has ToastProvider + a modal pattern.
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use a modal — native dialogs cannot be translated or tested. See frontend-architecture § Copy." },
        { name: "alert", message: "Use notify.error() from @/lib/toast." },
        { name: "prompt", message: "Use a modal — native dialogs cannot be translated or tested." },
      ],

      // frontend-architecture § Naming: use the `@/` alias. `warn`, not
      // `error` — there is a standing baseline of 51 deep relative imports
      // listed as accepted debt, which this rule must not contradict.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["../../../*"],
              message: "Use the `@/` alias instead of a deep relative import. See frontend-architecture § Naming.",
            },
          ],
        },
      ],

      // Unused code is the debt frontend-architecture § The rule is aimed at:
      // a shared thing with no callers. Args prefixed `_` stay allowed.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
