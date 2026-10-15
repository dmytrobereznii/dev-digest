/**
 * Message namespaces for component tests.
 *
 * A colocated test under `app/**` is up to eight levels deep, so importing
 * `messages/en/*.json` directly is the deep-relative import that
 * `frontend-architecture` § Naming rules out. From here it is two levels, and
 * tests reach it through the `@/` alias.
 */
export { default as prReview } from "../../messages/en/prReview.json";
export { default as shell } from "../../messages/en/shell.json";
export { default as context } from "../../messages/en/context.json";
export { default as brief } from "../../messages/en/brief.json";
export { default as eval } from "../../messages/en/eval.json";
export { default as agents } from "../../messages/en/agents.json";
