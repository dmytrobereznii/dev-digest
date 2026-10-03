/** Owners that can have Project Context documents attached. */
export const CONTEXT_OWNERS = ['agents', 'skills'] as const;
export type ContextOwner = (typeof CONTEXT_OWNERS)[number];

/** Directory names that classify a document, nearest one wins. */
export const DOCUMENT_TYPE_DIRS = ['specs', 'docs', 'insights'] as const;
