/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export { lineKey } from "./comments";
export type { DiffCommentApi } from "./comments";
export type { DiffTarget } from "./helpers";
export type { LineAnnotation, LineMarker } from "./annotations";
