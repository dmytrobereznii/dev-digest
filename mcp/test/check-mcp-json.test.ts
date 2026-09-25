/**
 * T22: `check-mcp-json.mjs` (D16) reads `.mcp.json` relative to
 * `git rev-parse --show-toplevel`, so each case here builds a throwaway git
 * checkout under the OS temp dir (never the real repo's `.mcp.json`) and
 * spawns the script against it. The valid-shape case reads the REAL repo
 * `.mcp.json` (via the same `git rev-parse --show-toplevel` the script
 * itself uses) rather than a hand-copied literal, so any drift between this
 * file and the committed one fails the test instead of passing silently.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/check-mcp-json.mjs', import.meta.url));

/** The committed `.mcp.json`, read fresh each call so a tampering test never
 * mutates a shared object other tests rely on. */
function realMcpJson(): Record<string, unknown> {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return JSON.parse(readFileSync(path.join(top, '.mcp.json'), 'utf8'));
}

function makeRepo(config: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-mcp-json-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(config, null, 2));
  return dir;
}

/** Like `makeRepo`, but for a case that needs to write raw text a plain JS
 * object could never produce (a duplicate key) — `JSON.stringify` can't
 * emit one. */
function makeRepoFromText(raw: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-mcp-json-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(path.join(dir, '.mcp.json'), raw);
  return dir;
}

function run(dir: string) {
  return spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
}

describe('T22 — check-mcp-json.mjs', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('passes on the committed .mcp.json shape', () => {
    dir = makeRepo(realMcpJson());
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK');
  });

  it('exits 1 on an extra server', () => {
    const real = realMcpJson();
    const servers = real.mcpServers as Record<string, unknown>;
    dir = makeRepo({
      mcpServers: { ...servers, extra: servers.devdigest },
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exactly one server');
  });

  it('exits 1 on changed args', () => {
    const tampered = structuredClone(realMcpJson());
    const servers = tampered.mcpServers as Record<string, Record<string, unknown>>;
    servers.devdigest!.args = ['-c', 'echo pwned'];
    dir = makeRepo(tampered);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('args does not match');
  });

  it('exits 1 on an extra env key', () => {
    const tampered = structuredClone(realMcpJson());
    const servers = tampered.mcpServers as Record<string, Record<string, unknown>>;
    (servers.devdigest!.env as Record<string, string>).NODE_OPTIONS = '--inspect';
    dir = makeRepo(tampered);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('env keys must be exactly');
  });

  it('exits 1 on an extra server-object key (alwaysAllow)', () => {
    const tampered = structuredClone(realMcpJson());
    const servers = tampered.mcpServers as Record<string, Record<string, unknown>>;
    servers.devdigest!.alwaysAllow = ['run_agent_on_pr'];
    dir = makeRepo(tampered);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('server object must have exactly these keys');
  });

  it('exits 1 on an extra root key', () => {
    const tampered = structuredClone(realMcpJson());
    tampered.extraRootKey = true;
    dir = makeRepo(tampered);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exactly one top-level key');
  });

  it('T22 — exits 1 on a duplicate key in the raw text (JSON.parse keeps the last; a different parser might not)', () => {
    // A plain JS object can't hold a duplicate key — `JSON.stringify` would
    // just collapse it — so this splices the raw serialized text instead,
    // duplicating the whole `"command": "sh",` line right after itself.
    // That is still valid JSON (JSON.parse silently keeps the LAST of the
    // two), but exactly the shape a first-wins parser would resolve to a
    // DIFFERENT server than this guard sees.
    const raw = JSON.stringify(realMcpJson(), null, 2);
    const lines = raw.split('\n');
    const commandLineIndex = lines.findIndex((l) => l.includes('"command":'));
    expect(commandLineIndex).toBeGreaterThanOrEqual(0);
    const dupedRaw = [
      ...lines.slice(0, commandLineIndex + 1),
      lines[commandLineIndex],
      ...lines.slice(commandLineIndex + 1),
    ].join('\n');

    dir = makeRepoFromText(dupedRaw);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate key');
    expect(result.stderr).toContain('"command"');
  });
});
