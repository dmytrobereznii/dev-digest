#!/usr/bin/env node
/**
 * D16 guard: run by `mcp.yml` in CI and by hand before touching `.mcp.json`.
 * Reads `.mcp.json` from the git top level — the same place the launcher
 * itself resolves `mcp/` from — and asserts exactly the shape §7 of the mcp
 * spec commits to, so a PR cannot quietly widen the launcher's command, args
 * or env (approval in Claude Code is keyed by server name, not content). The
 * root-object and server-object key sets are checked EXACTLY (no extra key,
 * e.g. `alwaysAllow`, `timeout`, `cwd`), not just the keys this file already
 * inspects — otherwise a PR could add one and the guard would still print OK.
 *
 * Plain Node, no dependencies: it must run with only `node` on PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_ARGS = [
  '-c',
  'cd "$(git rev-parse --show-toplevel)/mcp" && exec node_modules/.bin/tsx src/index.ts',
];
const ALLOWED_ENV_KEYS = ['DEVDIGEST_API_URL', 'DEVDIGEST_MCP_MAX_WAIT_S', 'DEVDIGEST_WEB_URL'];

function fail(reason) {
  console.error(`check-mcp-json: ${reason}`);
  process.exit(1);
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Duplicate-key scan over the RAW JSON text — `JSON.parse` alone silently
 * keeps the LAST of two same-named keys in an object, but a different
 * parser (e.g. a hand-rolled first-wins one) could resolve the SAME text to
 * a different server than the one this guard just validated. A regex cannot
 * tell a `"command"` that is an object KEY from one that is a STRING VALUE
 * without tracking quoting and nesting state — that is exactly what a small
 * hand-written tokenizer does, so this walks the text character by
 * character rather than pattern-matching it.
 *
 * Returns the first duplicate key found (as `{key}`), or `null`. A key is
 * only "duplicate" within the SAME object — `id` appearing once in two
 * different nested objects is fine.
 */
function findDuplicateKey(text) {
  let i = 0;
  const n = text.length;

  function skipWs() {
    while (i < n && /\s/.test(text[i])) i++;
  }

  /** `text[i]` is the opening `"` of a JSON string. Returns the decoded
   * string and advances `i` past the closing `"`. */
  function readString() {
    const start = i;
    i++; // opening quote
    while (i < n) {
      const c = text[i];
      if (c === '\\') {
        i += 2; // skip the escaped character, whatever it is
        continue;
      }
      if (c === '"') {
        i++; // closing quote
        return JSON.parse(text.slice(start, i));
      }
      i++;
    }
    throw new Error('unterminated string');
  }

  /** Consume one JSON value at `i`, recursing into objects/arrays so nested
   * duplicate keys are caught too. Returns the duplicate found inside, if
   * any. */
  function readValue() {
    skipWs();
    const c = text[i];
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"') {
      readString();
      return null;
    }
    // number / true / false / null — not a shape we need to validate here,
    // `JSON.parse` (run by the caller) already rejects malformed JSON.
    while (i < n && !',}]'.includes(text[i]) && !/\s/.test(text[i])) i++;
    return null;
  }

  function readObject() {
    i++; // '{'
    const seen = new Set();
    skipWs();
    if (text[i] === '}') {
      i++;
      return null;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') throw new Error('expected an object key');
      const key = readString();
      if (seen.has(key)) return { key };
      seen.add(key);
      skipWs();
      if (text[i] !== ':') throw new Error('expected ":" after an object key');
      i++;
      const inner = readValue();
      if (inner) return inner;
      skipWs();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return null;
      }
      throw new Error('malformed object');
    }
  }

  function readArray() {
    i++; // '['
    skipWs();
    if (text[i] === ']') {
      i++;
      return null;
    }
    for (;;) {
      const inner = readValue();
      if (inner) return inner;
      skipWs();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return null;
      }
      throw new Error('malformed array');
    }
  }

  return readValue();
}

let top;
try {
  top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch {
  fail('not inside a git checkout (git rev-parse --show-toplevel failed)');
}

const mcpJsonPath = path.join(top, '.mcp.json');
let raw;
try {
  raw = readFileSync(mcpJsonPath, 'utf8');
} catch {
  fail(`.mcp.json not found at ${mcpJsonPath}`);
}

let config;
try {
  config = JSON.parse(raw);
} catch (err) {
  fail(`.mcp.json is not valid JSON: ${err.message}`);
}

let dup;
try {
  dup = findDuplicateKey(raw);
} catch (err) {
  fail(`could not scan .mcp.json for duplicate keys: ${err.message}`);
}
if (dup) {
  fail(
    `duplicate key "${dup.key}" in .mcp.json — JSON.parse keeps the LAST occurrence, but a different parser might not, and would see a different server than this guard just validated`,
  );
}

const rootKeys = Object.keys(config ?? {}).sort();
if (!sameArray(rootKeys, ['mcpServers'])) {
  fail(`.mcp.json must have exactly one top-level key, "mcpServers"; got: ${rootKeys.join(', ') || '(none)'}`);
}

const servers = config?.mcpServers;
if (servers == null || typeof servers !== 'object') {
  fail('.mcp.json has no mcpServers object');
}

const names = Object.keys(servers);
if (names.length !== 1 || names[0] !== 'devdigest') {
  fail(`mcpServers must have exactly one server, "devdigest"; got: ${names.join(', ') || '(none)'}`);
}

const server = servers.devdigest;

const serverKeys = Object.keys(server ?? {}).sort();
const expectedServerKeys = ['args', 'command', 'env', 'type'];
if (!sameArray(serverKeys, expectedServerKeys)) {
  fail(
    `devdigest server object must have exactly these keys: ${expectedServerKeys.join(', ')}; got: ${serverKeys.join(', ') || '(none)'}`,
  );
}

if (server.type !== 'stdio') {
  fail(`devdigest.type must be "stdio"; got ${JSON.stringify(server.type)}`);
}

if (server.command !== 'sh') {
  fail(`devdigest.command must be "sh"; got ${JSON.stringify(server.command)}`);
}

if (!sameArray(server.args, EXPECTED_ARGS)) {
  fail(`devdigest.args does not match the expected launcher; got ${JSON.stringify(server.args)}`);
}

const envKeys = Object.keys(server.env ?? {}).sort();
const expectedEnvKeys = [...ALLOWED_ENV_KEYS].sort();
if (!sameArray(envKeys, expectedEnvKeys)) {
  fail(`devdigest.env keys must be exactly ${expectedEnvKeys.join(', ')}; got: ${envKeys.join(', ') || '(none)'}`);
}

console.log('check-mcp-json: OK');
