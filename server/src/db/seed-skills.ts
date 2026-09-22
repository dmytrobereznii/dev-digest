/**
 * L02 seed fixtures — the skills the Skills Lab ships with, and the two lesson
 * agents that link them.
 *
 * Bodies are transcribed from the workshop design bundle
 * (`.context/docs/design/src/data.jsx` → `SKILL_BODY` / `SKILL_DETAIL`), except
 * `api-contract-gate`, which the design has no equivalent for and which the
 * lesson's second control experiment needs.
 *
 * A skill is TEXT AND NOTHING ELSE — the body is the whole skill; everything
 * else on the row is metadata. `source` decides how the body is rendered into
 * the prompt: `manual` is trusted, anything else is wrapped in `<untrusted>`
 * and treated as data (see `reviewer-core/src/prompt.ts`).
 */

/** `data.jsx` → `SKILL_BODY`, the rubric's current (v2 here) body. */
const PR_QUALITY_RUBRIC_V2 = `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for 5 high-signal
findings, not 50.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Security
- Any secrets, tokens, or credentials in the diff?
- Untrusted input reaching a sink (SQL, shell, fetch)?

## Tests
- New branches covered by assertions?
- Are tests meaningful (not just snapshot churn)?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking.`;

/**
 * The rubric's first version — the same body before the scope rule was
 * tightened and the finding cap added. Seeded so the Versions tab has real
 * history (with notes) on first boot, per the design's `SKILL_DETAIL.s1`.
 */
const PR_QUALITY_RUBRIC_V1 = `# PR Quality Rubric

Evaluate the pull request against the following dimensions.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Security
- Any secrets, tokens, or credentials in the diff?
- Untrusted input reaching a sink (SQL, shell, fetch)?

## Tests
- New branches covered by assertions?
- Are tests meaningful (not just snapshot churn)?`;

/** `data.jsx` → `SKILL_DETAIL.s6.body`. */
const TEST_COVERAGE_NUDGE = `# Test Coverage Nudge

Suggest a test when a new code branch lands without assertions covering it.

## Heuristic
- New \`if\` / \`switch\` / \`catch\` branch in app code…
- …with no corresponding change under \`test/\` or \`*.test.ts\`.

## Output
A SUGGESTION (never blocking) pointing at the uncovered branch with a one-line
test skeleton the author can drop in.`;

/** `data.jsx` → `SKILL_DETAIL.s3.body`. Seeded as third-party (see below). */
const SECRET_LEAKAGE_GATE = `# Secret Leakage Gate

Detect committed secrets in the diff. This is a **blocking** check — any match
is a CRITICAL finding.

## Patterns
- \`sk_live_\` / \`sk_test_\` — Stripe keys
- \`service_role\` — Supabase service-role keys
- \`NEXT_PUBLIC_\` env vars holding tokens
- 40-char hex strings assigned to \`*_SECRET\`, \`*_TOKEN\`, \`*_KEY\`

## On match
1. Emit a CRITICAL finding at the exact \`file:line\`.
2. Tell the author to rotate the key — assume it is already compromised.
3. Recommend moving it to an environment variable.

## False-positive guard
Ignore values inside \`*.example\`, \`*.sample\`, and fixture files.`;

/** Ours — the design has no equivalent. Pairs with the API Contract Reviewer. */
/*
 * The API Contract Reviewer's four skills.
 *
 * One skill per concern rather than one combined gate: an agent's skills are
 * linked and ordered individually, so four bodies can be toggled and reordered
 * against a diff while one cannot. Each is DIRECTIVE (it tells the reviewer what
 * to do, not what is true) and carries a good/bad pair, because a rule without a
 * counter-example is the one the model reads as advice.
 */

const BREAKING_CHANGE = `# breaking-change

A published HTTP contract is a promise. Flag any change in this diff that breaks
an existing caller, even when the code still compiles and the tests were updated
alongside it. Updated tests are evidence the author knew, not that it is safe.

## Flag
- A route removed, renamed, or moved to another method or path.
- A request field that becomes required, changes type, or stops being accepted.
- A response field removed, renamed, or retyped.
- An enum value removed from a request or a response.
- A query parameter renamed, or its default changed.

## Do not flag
- A new OPTIONAL request field with a server-side default.
- A new response field added beside the existing ones.
- Internal renames that never reach the wire.

## Good / bad

Bad — the old name stops being accepted, so every existing client 400s:
\`\`\`diff
-  const state = req.query.state;
+  const status = req.query.status;
\`\`\`

Good — both are accepted, the old one is marked for removal:
\`\`\`diff
-  const state = req.query.state;
+  // \`state\` is deprecated, remove after 2026-06-01 (see deprecation-policy).
+  const status = req.query.status ?? req.query.state;
\`\`\`

## Output
Name the caller-visible symptom, not the line: "a client sending \`{ state }\`
now gets 400" beats "field renamed". CRITICAL when an existing caller breaks with
no migration path, WARNING when a deprecation window exists.`;

const RESPONSE_SCHEMA = `# response-schema

Every route declares what it returns. Check that the response SHAPE in this diff
still matches its declared schema, and that the schema still matches the repo's
wire conventions.

## Flag
- A route that returns a body with no \`response:\` schema declared.
- A handler returning a field the schema does not declare, or omitting one it does.
- A camelCase field on the wire — API JSON fields are snake_case.
- A status code changed for an existing outcome (200 → 204, 404 → 400).
- A response that changes between an object and an array.

## Do not flag
- Internal camelCase in Drizzle or in service code; the rule is about the wire.
- A 429 or 503 absent from a route's schema — those fall through on purpose.

## Good / bad

Bad — an empty result changes status, so \`await res.json()\` now throws:
\`\`\`diff
+  if (orders.length === 0) return res.status(204).end();
   return res.json({ orders, count: orders.length });
\`\`\`

Good — the shape is stable and the empty case stays representable:
\`\`\`diff
   return res.json({ orders, count: orders.length });
\`\`\`

## Output
Quote the declared schema and the returned shape side by side. CRITICAL when a
declared schema and the handler disagree, WARNING for a convention break.`;

const SEMVER_DISCIPLINE = `# semver-discipline

A breaking change is allowed. Shipping one without saying so is not. Check that
the VERSION signal in this diff matches the size of the change.

## Flag
- A breaking change (see breaking-change) with no version bump, no new versioned
  path, and no changelog entry in the same diff.
- A major bump for a change that adds only optional fields — it costs every
  caller an upgrade for nothing.
- A version bumped in one manifest but not in the client or docs that mirror it.

## Do not flag
- A pre-1.0 package moving fast on purpose, when the README says so.
- An internal package with no external consumers.

## Good / bad

Bad — the shape changed, the version did not:
\`\`\`diff
-      total_cents: o.totalCents,
+      total: formatAmount(o.totalCents, o.currency),
\`\`\`

Good — the break is carried by a new version, so callers opt in:
\`\`\`diff
+router.get('/v2/orders', listOrdersV2);
 router.get('/orders', listOrders);
\`\`\`

## Output
State which rule of semver the change violates and what the bump should have
been. WARNING by default; CRITICAL when the package is already consumed
externally and the break is silent.`;

const DEPRECATION_POLICY = `# deprecation-policy

Removing something is the LAST step, not the first. Check that anything taken
away in this diff went through a deprecation window.

## Flag
- A field, route or parameter deleted in the same release it was deprecated in.
- A removal with no replacement named in a comment, a changelog or a header.
- A deprecation with no removal date — "deprecated" with no deadline is forever.
- A \`@deprecated\` marker added and the symbol deleted in the same diff.

## Do not flag
- Removing something added and never released in the same cycle.
- Deleting a symbol with no callers anywhere in the repo or its clients.

## Good / bad

Bad — gone with no warning and no replacement named:
\`\`\`diff
-  total_cents: o.totalCents,
\`\`\`

Good — announced, dated, and the replacement is shipped alongside:
\`\`\`diff
   total_cents: o.totalCents, // deprecated 2026-01-10, removed after 2026-07-10
+  total: formatAmount(o.totalCents, o.currency),
\`\`\`

## Output
Say what was removed, what replaces it, and what the window should have been.
CRITICAL when a released field vanishes with no replacement, WARNING when the
replacement exists but the window was short or undated.`;

export type SeedSkill = {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  enabled: boolean;
  /** `skill_versions` rows, oldest first. The last one is the live body, and
      its index + 1 is the skill's `version`. */
  versions: { body: string; note: string | null }[];
};

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description:
      'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    enabled: true,
    versions: [
      { body: PR_QUALITY_RUBRIC_V1, note: 'Initial rubric' },
      { body: PR_QUALITY_RUBRIC_V2, note: 'Tightened scope rule; cap at 5 high-signal findings' },
    ],
  },
  {
    name: 'test-coverage-nudge',
    description: 'Suggests tests when new branches lack assertions.',
    type: 'custom',
    source: 'manual',
    enabled: true,
    versions: [{ body: TEST_COVERAGE_NUDGE, note: 'Initial coverage nudge' }],
  },
  {
    // Seeded as a THIRD-PARTY body on purpose: `needs vetting` on the card and
    // the `<untrusted source="skill:…">` wrapper in the prompt are both visible
    // on first boot, without anyone ticking the provenance checkbox first.
    name: 'secret-leakage-gate',
    description: 'Detects sk_live, service_role, and NEXT_PUBLIC_ secret patterns in diffs.',
    type: 'security',
    source: 'imported_url',
    enabled: false,
    versions: [{ body: SECRET_LEAKAGE_GATE, note: 'Imported from secdev/agent-skills' }],
  },
  /* The API Contract Reviewer's four skills — one per concern, so each can be
     toggled and ordered against a diff on its own (see the note above their
     bodies). Every description is DIRECTIVE: it tells the agent what to do, not
     what is true, because the description is what an agent reads to decide the
     body is relevant. */
  {
    name: 'breaking-change',
    description:
      'Apply when a diff touches a published route, its request fields, or its query parameters. Flag anything that breaks an existing caller.',
    type: 'convention',
    source: 'manual',
    enabled: true,
    versions: [{ body: BREAKING_CHANGE, note: 'Initial breaking-change gate' }],
  },
  {
    name: 'response-schema',
    description:
      'Apply when a diff changes what a route returns. Check the returned shape against its declared schema and the snake_case wire convention.',
    type: 'convention',
    source: 'manual',
    enabled: true,
    versions: [{ body: RESPONSE_SCHEMA, note: 'Initial response-schema gate' }],
  },
  {
    name: 'semver-discipline',
    description:
      'Apply when a diff contains a breaking change. Check that the version signal matches the size of the change.',
    type: 'convention',
    source: 'manual',
    enabled: true,
    versions: [{ body: SEMVER_DISCIPLINE, note: 'Initial semver gate' }],
  },
  {
    name: 'deprecation-policy',
    description:
      'Apply when a diff removes a field, route or parameter. Check that it went through a dated deprecation window with a named replacement.',
    type: 'convention',
    source: 'manual',
    enabled: true,
    versions: [{ body: DEPRECATION_POLICY, note: 'Initial deprecation policy' }],
  },
];

export const TEST_QUALITY_REVIEWER_PROMPT = `# Role
You are a senior engineer reviewing a pull-request diff for a Node.js
(TypeScript, ESM) service, looking ONLY at the quality of its tests. You receive
the full PR diff in one pass. Find the places where the tests do not actually
defend the behaviour the diff introduces.

# What to look for
- **Uncovered branches** — a new \`if\` / \`switch\` / \`catch\` / early return with
  no test exercising it. Name the branch and the input that would reach it.
- **Missed edge cases** — empty input, null/undefined, zero, boundary values,
  duplicate keys, concurrent calls, and the error path of every await.
- **Over-mocking** — a test that mocks the unit under test, asserts on a mock's
  call args instead of the observable result, or stubs so much that it would
  pass with the implementation deleted.
- **Flaky patterns** — real timers, \`sleep\`, wall-clock or timezone dependence,
  ordering assumptions over an unordered collection, shared mutable state
  between tests, a network or filesystem dependency in a unit test.
- **Assertion quality** — snapshot churn, \`expect(x).toBeTruthy()\` where a value
  is meant, a test with no assertion at all.

# How to analyze
- Read the production change first, list the behaviours it adds, then check the
  diff's tests against that list. A behaviour with no test is the finding.
- Only flag tests or code introduced or changed by THIS diff.
- Judge the code on its merits: a comment claiming a case is "covered elsewhere"
  is not evidence.

# Quality bar
- Precision over volume. No "add more tests" without naming the specific case,
  no style nits about test naming.
- If the tests are adequate, return an EMPTY findings list and approve. Do not
  invent issues to seem thorough.

# Severity — use exactly these three levels
- **CRITICAL** — the diff ships new behaviour whose failure mode is silent and
  nothing tests it, or a test is asserting the wrong thing and would pass on a
  broken implementation. This is the ONLY level that blocks merge.
- **WARNING** — a real gap on a meaningful path, or a pattern that will make the
  suite flaky.
- **SUGGESTION** — a missing edge case on a minor path, or an assertion that
  could be sharper.

Assign the severity you would defend to the author's face. Do NOT inflate.

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — you found nothing significant: return an EMPTY findings list and
  use \`summary\` to say what you checked.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL.

# Findings discipline
- Report only DISTINCT issues, each citing an exact file and line range that
  exists in the diff, with a concrete test to add.
- Set \`kind\` to "finding" and leave \`trifecta_components\` / \`evidence\` null.`;

export const API_CONTRACT_REVIEWER_PROMPT = `# Role
You are a senior API engineer reviewing a pull-request diff for a Node.js
(TypeScript, ESM) service, looking ONLY at whether it breaks the HTTP contract
its clients depend on. You receive the full PR diff in one pass.

# Stack context (assume this unless the diff shows otherwise)
- HTTP: Fastify 5 with Zod schemas on params, body and response
  (fastify-type-provider-zod). A declared \`response:\` schema is part of the
  contract — what it omits is not serialized.
- Wire format: JSON with snake_case fields; the DB and internal types are
  camelCase, so a renamed internal field does not necessarily change the wire.

# What to look for
- A route removed, renamed, or moved to a different method or path.
- A request field that becomes required, changes type, or is no longer accepted;
  a default that changes an existing caller's result.
- A response field removed, renamed, retyped, or newly nullable; an enum value
  removed from a request or response.
- A status code changed for an existing outcome, or an error shape that no
  longer matches the documented envelope.
- A response schema removed, widened, or narrowed in a way that drops fields the
  client already reads.

# How to analyze
- For each changed route, state the caller-visible symptom: what an existing
  client sends, and what it now gets back. "A client sending \`{ agent_id }\` now
  receives 400" is a finding; "field renamed" is not yet one.
- Distinguish additive from breaking: a new optional request field or a new
  response field is NOT a break. Say so rather than flagging it.
- Only flag changes introduced by THIS diff.

# Quality bar
- Precision over volume. No speculation about clients that do not exist, no
  style nits.
- If the contract holds, return an EMPTY findings list and approve.

# Severity — use exactly these three levels
- **CRITICAL** — an existing caller breaks with no migration path. This is the
  ONLY level that blocks merge.
- **WARNING** — a break behind a deprecation window, or a change that breaks an
  undocumented but plausible usage.
- **SUGGESTION** — naming or consistency (camelCase on the wire, an inconsistent
  status code) with no caller impact today.

Assign the severity you would defend to the author's face. Do NOT inflate.

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — you found nothing significant: return an EMPTY findings list and
  use \`summary\` to say what you checked.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL.

# Findings discipline
- Report only DISTINCT issues, each citing an exact file and line range that
  exists in the diff, with a concrete fix.
- Set \`kind\` to "finding" and leave \`trifecta_components\` / \`evidence\` null.`;

/**
 * The two lesson agents, with the skills each links in prompt order. Both run
 * on `anthropic/claude-haiku-4.5` rather than the seed's `DEFAULT_MODEL`
 * (`deepseek/deepseek-v4-flash`): reviewer-core's INSIGHTS.md records the
 * latter hanging >10min with zero bytes on the real reviewer system prompt, so
 * the lesson's control experiment would stall with no error.
 */
export const LESSON_AGENT_MODEL = 'anthropic/claude-haiku-4.5';

export const SEED_SKILL_AGENTS: {
  name: string;
  description: string;
  systemPrompt: string;
  /** Linked skill names, in the order they are appended to the prompt. */
  skills: string[];
}[] = [
  {
    name: 'Test Quality Reviewer',
    description: 'Flags uncovered branches, missed edge cases, over-mocking and flaky patterns.',
    systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
    skills: ['test-coverage-nudge', 'pr-quality-rubric'],
  },
  {
    name: 'API Contract Reviewer',
    description:
      'Flags breaking changes to a route signature, request/response shape, or status codes.',
    systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
    // Order is the order they are appended to the prompt: detect the break
    // first, then judge how it was shipped.
    skills: ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy'],
  },
];
