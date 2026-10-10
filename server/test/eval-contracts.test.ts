import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (root: 'server' | 'client', f: string) =>
  readFileSync(fileURLToPath(new URL(`../../${root}/src/vendor/shared/${f}`, import.meta.url)), 'utf8');

describe('eval contracts vendoring (slice A)', () => {
  it('contracts/eval.ts, contracts/review-api.ts and index.ts are byte-identical in both vendored copies', () => {
    for (const f of ['contracts/eval.ts', 'contracts/review-api.ts', 'index.ts']) {
      const server = read('server', f);
      expect(server.length, `${f} is empty`).toBeGreaterThan(0);
      expect(read('client', f), `${f} differs between client and server`).toBe(server);
    }
  });
});
