/** Constants for the conventions module. */

/**
 * Ranked source files asked of repo-intel per scan (spec §3.3 step 2).
 * `getConventionSamples` already drops tests, configs and migrations, so this
 * is 12 files of real product code — the config files below are added on top.
 */
export const SAMPLE_FILE_COUNT = 12;

/**
 * The fixed config-file list (D5 step 1). Selection is CODE, not a model call:
 * these paths are the same in every repo, so guessing at them is pure cost.
 *
 * `GitClient.readFile` takes an exact path and the port has NO glob, so the
 * spec's glob-ish entries (`eslint.config.*`, `.eslintrc*`, `.prettierrc*`,
 * `prettier.config.*`) are enumerated here as explicit candidates instead.
 * Reading a path that isn't there is a caught, silently-skipped failure
 * (§3.3 step 2), which is what makes over-listing cheap and safe — the cost of
 * a miss is one failed stat, and the cost of not listing an extension is a
 * config file we never see.
 */
export const CONFIG_FILE_CANDIDATES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
  'prettier.config.ts',
  '.editorconfig',
];

/**
 * Per-file and whole-sample budget.
 *
 * GUESSED, NOT MEASURED — the spec's §9 open question flags exactly this, and
 * it is still open: set these from one real run against a mid-sized repo before
 * treating them as tuned. The shape of the guess: 200 lines is enough of a file
 * to show its house style (imports, error handling, naming) without paying for
 * its long tail, and ~60k chars is roughly 15k tokens of samples, which leaves
 * a cheap model plenty of room for the instructions and its answer.
 *
 * The gate grounds against the TRUNCATED text, not the file on disk, so a
 * budget that cuts a file can only ever cause a candidate to be dropped — never
 * a hallucinated citation to be accepted (D6).
 */
export const MAX_FILE_LINES = 200;
export const MAX_SAMPLE_CHARS = 60_000;

/** Appended to a file's heading when the budget cut it, so the model knows the
 *  text it can quote from ends there (§3.3 step 2). */
export const TRUNCATION_NOTE = 'truncated';

/** Confidence used when the model omits one (D6). */
export const DEFAULT_CONFIDENCE = 0.5;

/** The system-prompt template under `src/prompts/` (loaded via `renderPrompt`). */
export const CONVENTIONS_PROMPT_TEMPLATE = 'conventions.system.md';

/**
 * The ONE structured schema name this module sends (D5). There is no second
 * call: file selection is code, so no `ConventionFileSelection` exists.
 */
export const CONVENTIONS_SCHEMA_NAME = 'ConventionExtraction';

/**
 * Per-request timeout for the extraction call.
 *
 * This — not Fastify — is what actually bounds `POST …/extract`. D7 says the
 * route "needs a raised `requestTimeout`"; there is nothing to raise. `app.ts`
 * passes no `requestTimeout` to Fastify and Fastify's default is `0`, i.e.
 * disabled, so the request already has no server-side deadline. The real clock
 * is the LLM client's: `OpenRouterProvider` defaults to 90s per attempt. Stating
 * it here makes the bound explicit and adjustable in one place.
 */
export const EXTRACTION_TIMEOUT_MS = 120_000;

/**
 * Provenance of the merged skill (D8) — never client-nameable. The TYPE is not
 * here: the route defaults it to `convention` and the user can change it in the
 * modal, so it is request data rather than a server-side constant.
 */
export const MERGED_SKILL_SOURCE = 'extracted' as const;
