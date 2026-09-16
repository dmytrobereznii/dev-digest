#!/usr/bin/env node
// Extracts the mentor's DevDigest design bundle into readable, greppable source.
//
//   node .context/docs/design/extract.mjs [path/to/DevDigest_design.html]
//
// Input  : the mentor's published canvas HTML. It is deliberately NOT in the
//          repo — this extraction replaces it — so pass the path to your own
//          copy. Read-only either way; the extractor never writes to it.
// Output : .context/docs/design/{src,canvas}/*.jsx, template.html, tokens.css,
//          logo.svg, index.json
//
// The bundle is a published Claude Design canvas: a self-unpacking loader whose
// payload is a gzip+base64 manifest keyed by UUID. Module filenames survive only
// inside each file's first-line banner comment, so we recover names from there.
//
// Deliberately NOT written out: the React/Babel vendor blobs (~4.2 MB) and the
// embedded Inter woff2 subsets. They carry no design information, and the
// original HTML already renders standalone when you want pixels.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ? resolve(process.argv[2]) : '';

if (!SRC || !existsSync(SRC)) {
  console.error(`Pass the path to the mentor's DevDigest_design.html:

  node .context/docs/design/extract.mjs ~/path/to/DevDigest_design.html

The bundle lives outside the repo — this directory is the copy we keep.`);
  process.exit(1);
}

// Canvas scaffolding from the design skill, not DevDigest design work.
const INFRA = new Set(['DesignCanvas.jsx', 'tweaks-panel.jsx']);

const srcBuf = readFileSync(SRC);
const html = srcBuf.toString('utf8');

const manifestRaw = /<script type="__bundler\/manifest">\s*(\{[\s\S]*?\})\s*<\/script>/.exec(html);
const templateRaw = /<script type="__bundler\/template">\s*("[\s\S]*?")\s*<\/script>/.exec(html);
if (!manifestRaw || !templateRaw) throw new Error('bundle layout changed: manifest/template not found');

const manifest = JSON.parse(manifestRaw[1]);
const template = JSON.parse(templateRaw[1]);

// Load order is the only dependency signal these window-global modules carry.
const order = [...template.matchAll(/<script[^>]*src="([0-9a-f-]{36})"/g)].map((m) => m[1]);
const rank = new Map(order.map((id, i) => [id, i]));

const decode = (entry) => {
  const buf = Buffer.from(entry.data, 'base64');
  return entry.compressed ? gunzipSync(buf) : buf;
};

// Screens banner as `/* screen_trace.jsx — N10 Run Trace ... */`; the two canvas
// infra modules lead with `/* BEGIN USAGE */` and name themselves on a `//` line.
const banner = (text) => {
  const head = text.slice(0, 400);
  const m = /(?:\/\*+|\/\/)\s*([A-Za-z0-9_.-]+\.jsx)\s*(?:[—-]\s*([^\n*]*))?/.exec(head);
  return m ? { name: m[1], desc: (m[2] || '').replace(/\s*\*\/\s*$/, '').trim() } : null;
};

for (const dir of ['src', 'canvas']) rmSync(join(OUT, dir), { recursive: true, force: true });
for (const dir of ['src', 'canvas']) mkdirSync(join(OUT, dir), { recursive: true });

const written = [];
const skipped = [];

for (const [id, entry] of Object.entries(manifest)) {
  if (entry.mime.startsWith('font/')) { skipped.push({ id, why: 'font', bytes: entry.data.length }); continue; }
  const text = decode(entry).toString('utf8');
  const info = banner(text);
  if (!info) { skipped.push({ id, why: 'vendor bundle (React/Babel)', bytes: text.length }); continue; }
  const dir = INFRA.has(info.name) ? 'canvas' : 'src';
  writeFileSync(join(OUT, dir, info.name), text);
  written.push({ file: `${dir}/${info.name}`, desc: info.desc, order: rank.get(id) ?? -1, bytes: text.length });
}

// The canvas composition (which artboards exist, in which section) is the final
// inline babel script rather than a manifest entry.
const inline = [...template.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
if (inline.trim()) {
  writeFileSync(join(OUT, 'canvas', 'canvas.jsx'), inline.trim() + '\n');
  written.push({ file: 'canvas/canvas.jsx', desc: 'artboard composition: sections, artboards, post-its', order: 999, bytes: inline.length });
}

writeFileSync(join(OUT, 'template.html'), template);

// The bundler's thumbnail mark sits in the outer loader, not the payload.
const logo = /<svg[\s\S]*?<\/svg>/.exec(html.replace(/<script type="__bundler\/\w+">[\s\S]*?<\/script>/g, ''));
if (logo) writeFileSync(join(OUT, 'logo.svg'), logo[0] + '\n');

// Design tokens without the ~250 lines of embedded @font-face noise.
const styles = [...template.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const tokens = styles.join('\n').replace(/\/\*[^*]*\*\/\s*@font-face\s*\{[\s\S]*?\}\n?/g, '').replace(/@font-face\s*\{[\s\S]*?\}\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
writeFileSync(join(OUT, 'tokens.css'), `/* Extracted from the mentor's design bundle. Generated — do not edit. */\n${tokens}\n`);

written.sort((a, b) => a.order - b.order);
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ source: basename(SRC), sourceBytes: srcBuf.length, sourceMd5: createHash('md5').update(srcBuf).digest('hex'), extractedAt: new Date().toISOString().slice(0, 10), generated: written, skipped }, null, 2) + '\n');

console.log(`wrote ${written.length} modules from ${(html.length / 1048576).toFixed(2)} MB bundle`);
for (const w of written) console.log(`  ${String(w.order).padStart(3)}  ${w.file.padEnd(34)} ${(w.bytes / 1024).toFixed(1).padStart(6)} KB  ${w.desc}`);
console.log(`skipped ${skipped.length} (fonts + vendor): ${(skipped.reduce((n, s) => n + s.bytes, 0) / 1048576).toFixed(2)} MB`);
