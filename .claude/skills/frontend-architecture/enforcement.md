# frontend-architecture — checking compliance

**`client/eslint.config.mjs` covers part of this** — `eslint-config-next`
plus the hook-dependency, native-dialog and `@/`-alias rules. Run it with
`make lint` (baseline **0 errors, 52 warnings**; the warnings are the
deep-relative-import debt in *Known exceptions*). Everything the linter cannot
express — data-fetching placement, barrel shape, the `"use client"` rung — is
still convention plus review, and these greps are the fallback. Run them from
`client/src`.

```sh
# a component calling the network directly (baseline 0; \b excludes refetch())
grep -rnE '\bfetch\(' --include='*.tsx' app components

# deep relative imports that should use @/
grep -rn --include='*.ts*' -E 'from "(\.\./){3,}' . | wc -l

# the barrel shape that fails the App Router build (baseline 0)
grep -rl 'export \*' --include='index.ts' . | xargs grep -l 'export { default' 2>/dev/null

# aggregating barrels — each hit is a file re-exporting several modules
grep -rc 'export \*' --include='index.ts' . | grep -v ':0$' | grep -v ':1$'

# breadth of the client boundary; compare against page.tsx count
grep -rl '"use client"' --include='*.tsx' . | wc -l
find app -name 'page.tsx' | wc -l
```

The aggregating-barrel grep always reports `vendor/ui` and `vendor/shared`;
those are vendored package entries, where a barrel is the right shape and the
code is not ours to change. Only `lib/hooks/index.ts` is ours.

The last pair is a trend, not a gate. The number that matters is whether the
files you just touched put `"use client"` at a subtree entry or at a route.

## If enforcement earns a dependency

Sourced options, in the order they would pay off:

| Rule | Catches | Package |
|---|---|---|
| `import/no-cycle` | the `module → index → module` cycle an aggregating barrel invites | `eslint-plugin-import` |
| `import/no-restricted-paths` | one route's `_components` imported by another route | `eslint-plugin-import` |
| `check-file/filename-naming-convention` | PascalCase components, kebab-case lib files | `eslint-plugin-check-file` |

The server uses `dependency-cruiser` (see
[`onion-architecture`](../onion-architecture/SKILL.md) § Enforcement). Nothing
in the research recommends it for a frontend, so matching the backend there
would be a local decision rather than a sourced one.
