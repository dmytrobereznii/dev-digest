import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `scripts/e2e.sh` sets NEXT_DIST_DIR=.next-e2e. Its `next dev` inlines a
  // different NEXT_PUBLIC_API_BASE (:3101), and sharing `.next` with a running
  // `make dev` left :3000 serving chunks that call the torn-down e2e API.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  webpack: (config) => {
    // `src/vendor/shared` is TypeScript SOURCE, type-checked with
    // moduleResolution "Bundler": its barrel re-exports
    // `./contracts/findings.js`, a specifier that points at a `.ts` file. tsc
    // and vitest both map that back; webpack does not.
    //
    // It only bites on a VALUE import from @devdigest/shared. Every import was
    // `import type` — erased before webpack sees it — until the client started
    // parsing responses with the Zod schemas themselves. Without this the dev
    // server and `next build` both fail with
    // `Module not found: Can't resolve './contracts/findings.js'`.
    //
    // Turbopack would need `turbopack.resolveExtensions` instead; the `dev` and
    // `build` scripts are webpack.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
