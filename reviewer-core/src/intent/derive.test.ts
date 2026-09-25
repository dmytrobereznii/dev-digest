import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { deriveIntent } from './derive.js';
import {
  MAX_ALL_DOCS_CHARS,
  MAX_BODY_CHARS,
  MAX_COMMITS,
  MAX_COMMIT_MESSAGE_CHARS,
  MAX_DIFF_EXCERPT_CHARS,
  MAX_DOC_CHARS,
} from './constants.js';

/** Records the last request it was called with and returns a canned draft. */
function stubLLM(overrides?: {
  draft?: { intent: string; in_scope: string[]; out_of_scope: string[]; confidence?: string };
  costUsd?: number | null;
}): { llm: LLMProvider; lastRequest: () => StructuredRequest<unknown> | undefined } {
  let last: StructuredRequest<unknown> | undefined;
  const llm: LLMProvider = {
    id: 'openrouter',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      last = req as unknown as StructuredRequest<unknown>;
      const data = (overrides?.draft ?? {
        intent: 'Add rate limiting to the public API.',
        in_scope: ['Return 429 with Retry-After header'],
        out_of_scope: ['Auth changes'],
      }) as unknown as T;
      return {
        data,
        model: req.model,
        tokensIn: 120,
        tokensOut: 45,
        costUsd: overrides?.costUsd === undefined ? 0.0012 : overrides.costUsd,
        raw: JSON.stringify(data),
        attempts: 1,
      };
    },
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('not used');
    },
    async embed() {
      return [];
    },
  };
  return { llm, lastRequest: () => last };
}

const baseInput = {
  model: 'anthropic/claude-haiku-4.5',
  title: 'Add rate limiting',
  body: 'Adds rate limiting to the public /api endpoints. Returns 429 with Retry-After.',
  branch: 'feat/rate-limit',
  commits: [{ message: 'add limiter' }, { message: 'add tests' }],
  files: [{ path: 'src/api/limiter.ts', additions: 40, deletions: 0 }],
  diffExcerpt: '+ export function limiter() {}',
  docs: [{ label: 'issue:#12', text: 'The API needs a rate limit per the design doc.' }],
};

describe('deriveIntent', () => {
  it('wraps every input with its own untrusted label', async () => {
    const { llm, lastRequest } = stubLLM();
    await deriveIntent({ llm, ...baseInput });
    const req = lastRequest()!;
    const user = req.messages[1]!.content;
    expect(user).toContain('<untrusted source="pr-title">');
    expect(user).toContain('<untrusted source="pr-branch">');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('<untrusted source="issue:#12">');
    expect(user).toContain('<untrusted source="commits">');
    expect(user).toContain('<untrusted source="paths">');
    expect(user).toContain('<untrusted source="diff-excerpt">');
    expect(user).toContain(baseInput.body);
    expect(user).toContain('The API needs a rate limit');
  });

  it('sends schemaName "IntentDraft" and the D10 timeout/retry budget', async () => {
    const { llm, lastRequest } = stubLLM();
    await deriveIntent({ llm, ...baseInput });
    const req = lastRequest()!;
    expect(req.schemaName).toBe('IntentDraft');
    expect(req.timeoutMs).toBe(60_000);
    expect(req.maxRetries).toBe(1);
  });

  it('forwards sessionId when given', async () => {
    const { llm, lastRequest } = stubLLM();
    await deriveIntent({ llm, ...baseInput, sessionId: 'sess-1' });
    expect(lastRequest()!.sessionId).toBe('sess-1');
  });

  it('truncates the body to MAX_BODY_CHARS before wrapping', async () => {
    const { llm, lastRequest } = stubLLM();
    const hugeBody = 'x'.repeat(MAX_BODY_CHARS + 500);
    await deriveIntent({ llm, ...baseInput, body: hugeBody });
    const user = lastRequest()!.messages[1]!.content;
    // The wrapped body should contain exactly MAX_BODY_CHARS x's, not more.
    expect(user).toContain('x'.repeat(MAX_BODY_CHARS));
    expect(user).not.toContain('x'.repeat(MAX_BODY_CHARS + 1));
  });

  it('caps each doc at MAX_DOC_CHARS and all docs together at MAX_ALL_DOCS_CHARS', async () => {
    const { llm, lastRequest } = stubLLM();
    // Distinct filler letters so each doc's run is identifiable even though
    // 'a'/'b'/'c' also appear incidentally elsewhere in the prompt (title,
    // body, diff excerpt) — the LONGEST contiguous run is what matters.
    const docs = [
      { label: 'issue:#1', text: 'q'.repeat(MAX_DOC_CHARS + 1000) },
      { label: 'issue:#2', text: 'k'.repeat(MAX_DOC_CHARS + 1000) },
      { label: 'issue:#3', text: 'j'.repeat(MAX_DOC_CHARS + 1000) },
    ];
    await deriveIntent({ llm, ...baseInput, docs });
    const user = lastRequest()!.messages[1]!.content;
    const longestRun = (text: string, char: string) =>
      Math.max(0, ...(text.match(new RegExp(`${char}+`, 'g')) ?? ['']).map((m) => m.length));

    // Each doc is truncated to MAX_DOC_CHARS first...
    expect(longestRun(user, 'q')).toBe(MAX_DOC_CHARS);
    expect(longestRun(user, 'k')).toBe(MAX_DOC_CHARS);
    // ...then the combined budget caps what's left for the third doc.
    const jRun = longestRun(user, 'j');
    expect(jRun).toBe(MAX_ALL_DOCS_CHARS - 2 * MAX_DOC_CHARS);
    expect(longestRun(user, 'q') + longestRun(user, 'k') + jRun).toBe(MAX_ALL_DOCS_CHARS);
  });

  it('truncates commit messages and caps the commit count', async () => {
    const { llm, lastRequest } = stubLLM();
    const commits = Array.from({ length: MAX_COMMITS + 5 }, (_, i) => ({
      message: `commit ${i} ` + 'z'.repeat(MAX_COMMIT_MESSAGE_CHARS + 50),
    }));
    await deriveIntent({ llm, ...baseInput, commits });
    const user = lastRequest()!.messages[1]!.content;
    expect(user).not.toContain(`commit ${MAX_COMMITS}`); // the (MAX_COMMITS+1)th message
    expect(user).not.toContain('z'.repeat(MAX_COMMIT_MESSAGE_CHARS + 1));
  });

  it('truncates the diff excerpt to MAX_DIFF_EXCERPT_CHARS', async () => {
    const { llm, lastRequest } = stubLLM();
    const hugeDiff = '+'.repeat(MAX_DIFF_EXCERPT_CHARS + 200);
    await deriveIntent({ llm, ...baseInput, diffExcerpt: hugeDiff });
    const user = lastRequest()!.messages[1]!.content;
    expect(user).toContain('+'.repeat(MAX_DIFF_EXCERPT_CHARS));
    expect(user).not.toContain('+'.repeat(MAX_DIFF_EXCERPT_CHARS + 1));
  });

  it('ignores a model-supplied confidence field entirely', async () => {
    const { llm } = stubLLM({
      draft: {
        intent: 'Add rate limiting.',
        in_scope: ['429s'],
        out_of_scope: [],
        confidence: 'high', // the model should not be able to set this
      },
    });
    const result = await deriveIntent({ llm, ...baseInput });
    expect(result.draft).not.toHaveProperty('confidence');
    // Confidence is computed by computeConfidence from the resolved inputs,
    // independent of anything the model reported.
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('passes tokens and cost through unchanged', async () => {
    const { llm } = stubLLM({ costUsd: 0.0042 });
    const result = await deriveIntent({ llm, ...baseInput });
    expect(result.tokensIn).toBe(120);
    expect(result.tokensOut).toBe(45);
    expect(result.costUsd).toBe(0.0042);
  });

  it('keeps a null cost null (sticky-null cost accounting)', async () => {
    const { llm } = stubLLM({ costUsd: null });
    const result = await deriveIntent({ llm, ...baseInput });
    expect(result.costUsd).toBeNull();
  });

  it('records which inputs had content as signals', async () => {
    const { llm } = stubLLM();
    const result = await deriveIntent({ llm, ...baseInput });
    expect(result.signals).toEqual(
      expect.arrayContaining(['title', 'description', 'linked_docs', 'commits', 'branch', 'file_paths', 'diff']),
    );
  });

  it('omits signals for empty inputs', async () => {
    const { llm } = stubLLM();
    const result = await deriveIntent({
      llm,
      model: baseInput.model,
      title: 'Add rate limiting',
      body: '',
      branch: '',
      commits: [],
      files: [],
      diffExcerpt: '',
      docs: [],
    });
    expect(result.signals).toEqual(['title']);
  });
});
