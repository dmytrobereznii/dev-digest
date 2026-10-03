/**
 * `sanitizeUntrusted` (D13) — the text a tool relays comes from a reviewed
 * repo or a model's own output, so it is treated as untrusted DATA, never as
 * instructions: this strips the characters that could hide a prompt
 * injection from a human skimming the tool result, defangs the two markdown
 * / HTML shapes that would otherwise render as a clickable image or link,
 * and caps length.
 */

/**
 * C0 controls (excl. \t \n), C1 controls, zero-width characters
 * (U+200B–200F, U+2060–2064, U+FEFF), bidi overrides (U+202A–202E,
 * U+2066–2069) and the Unicode tag block (U+E0000–E007F) — the ranges a
 * prompt-injection attempt would use to hide text from a human reading the
 * tool result while an LLM still "sees" it.
 */
const CONTROL_AND_INVISIBLE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F' +
    '\\u200B-\\u200F\\u2060-\\u2064\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]' +
    '|[\\u{E0000}-\\u{E007F}]',
  'gu',
);

/** `![alt](url)` → `[image: alt]` — a rendered image is not a code excerpt. */
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;

/** `<img` / `<a` → HTML-escaped so a client's markdown renderer sees text,
 * not a live tag. Word-bounded so `<article>` / `<abbr>` are left alone. */
const HTML_IMG_TAG = /<img\b/gi;
const HTML_A_TAG = /<a\b/gi;

export interface SanitizeOptions {
  /** Collapse `\r`/`\n` to a single space — for single-line fields like
   * `title`, `file`/`location` and `evidence_path` (D13). Multi-line fields
   * (rationale, summary, …) omit this and keep their newlines. */
  singleLine?: boolean;
}

/** Sanitize untrusted text: strip hidden/control characters, defang image
 * and anchor markup, optionally collapse newlines, then cap at `max` chars. */
export function sanitizeUntrusted(text: string, max: number, opts: SanitizeOptions = {}): string {
  let out = text.replace(CONTROL_AND_INVISIBLE, '');
  out = out.replace(MARKDOWN_IMAGE, '[image: $1]');
  out = out.replace(HTML_IMG_TAG, '&lt;img').replace(HTML_A_TAG, '&lt;a');
  if (opts.singleLine) {
    out = out.replace(/[\r\n]+/g, ' ');
  }
  return out.length > max ? out.slice(0, max) : out;
}
