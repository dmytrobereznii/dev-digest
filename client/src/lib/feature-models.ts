/**
 * Per-feature model registry — re-exported straight from `@devdigest/shared`
 * (L03 D12). This used to be a hand-mirrored copy: the header comment claimed a
 * value import from the vendored shared package breaks webpack, which no
 * longer holds (`next.config.mjs` now sets `resolve.extensionAlias`, client
 * INSIGHTS 2026-09-20) — and the mirror had already drifted from the shared
 * registry (`conventions` was `openai/gpt-5.4` here, `openrouter/anthropic/
 * claude-haiku-4.5` in shared). One registry now, not two.
 */
export { FEATURE_MODELS } from "@devdigest/shared";
