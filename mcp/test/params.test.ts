/**
 * `prNumberParam` — the int4 upper bound (bug fix: the server's
 * `pull_requests.number` column is Postgres int4, so an oversized `pr_number`
 * has to fail HERE, at the MCP boundary, with a clear message — not
 * round-trip to a 422 from `GET /repos/:id/pulls/:number`).
 */
import { describe, expect, it } from 'vitest';
import { agentParam, prNumberParam, repoParam } from '../src/tools/params.js';
import { AGENT_NAME_MAX, REPO_FULL_NAME_MAX } from '../src/tools/constants.js';

const INT4_MAX = 2147483647;

describe('prNumberParam — the int4 upper bound', () => {
  const schema = prNumberParam();

  it('accepts the int4 max', () => {
    const result = schema.safeParse(INT4_MAX);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(INT4_MAX);
  });

  it('rejects a PR number over the int4 max', () => {
    expect(schema.safeParse(INT4_MAX + 1).success).toBe(false);
    expect(schema.safeParse(3000000000).success).toBe(false);
  });

  it('rejects an over-max value given as a string, after D8 coercion', () => {
    expect(schema.safeParse('3000000000').success).toBe(false);
    expect(schema.safeParse('#3000000000').success).toBe(false);
  });
});

// Regression: `repoParam`/`agentParam` were plain `z.string()` with no upper
// bound, so an unbounded caller input reached every downstream sanitize/cap
// pass unclamped. Bound it at the boundary, like `prNumberParam` already
// does for its own field.
describe('repoParam / agentParam — bounded caller input', () => {
  it('accepts a repo string at REPO_FULL_NAME_MAX', () => {
    const ok = 'a'.repeat(REPO_FULL_NAME_MAX - 6) + '/name1';
    expect(repoParam().safeParse(ok).success).toBe(true);
  });

  it('rejects a repo string over REPO_FULL_NAME_MAX', () => {
    const tooLong = 'a'.repeat(REPO_FULL_NAME_MAX + 1);
    expect(repoParam().safeParse(tooLong).success).toBe(false);
  });

  it('accepts an agent string at AGENT_NAME_MAX', () => {
    const ok = 'a'.repeat(AGENT_NAME_MAX);
    expect(agentParam().safeParse(ok).success).toBe(true);
  });

  it('rejects an agent string over AGENT_NAME_MAX', () => {
    const tooLong = 'a'.repeat(AGENT_NAME_MAX + 1);
    expect(agentParam().safeParse(tooLong).success).toBe(false);
  });
});
