/**
 * Message namespaces for component tests.
 *
 * A colocated test under `app/**` is up to eight levels deep, so importing
 * `messages/en/*.json` directly is the deep-relative import that
 * `frontend-architecture` § Naming rules out. From here it is two levels, and
 * tests reach it through the `@/` alias.
 */
export { default as prReview } from "../../messages/en/prReview.json";
