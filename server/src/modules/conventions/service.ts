import type {
  ConventionCandidate,
  ConventionStatus,
  Skill,
  SkillType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { toSkillDto } from '../skills/service.js';
import type { BulkStatus, ConventionsRepository, RepoBasics } from './repository.js';
import {
  dedupeKey,
  groundCandidate,
  toCandidateDto,
  toScanDto,
  type ConventionScanDto,
} from './helpers.js';
import {
  applySampleBudget,
  buildExtractionMessages,
  ConventionExtraction,
  truncateFile,
  type SampledFile,
} from './prompt.js';
import {
  CONFIG_FILE_CANDIDATES,
  CONVENTIONS_SCHEMA_NAME,
  EXTRACTION_TIMEOUT_MS,
  MERGED_SKILL_SOURCE,
  SAMPLE_FILE_COUNT,
} from './constants.js';

/**
 * Conventions service — scan a cloned repo for its house rules, hold them as
 * candidates the user triages, and merge the accepted set into one skill.
 *
 * The policy lives here; the two halves either side of it do not. Selection and
 * the model dialogue are in `./prompt.ts`, the evidence gate is in
 * `./helpers.ts` (pure, so it tests without a clone), and every statement is in
 * `./repository.ts`. What is left in this file is sequencing and the two rules
 * that are genuinely decisions: a repo with no clone cannot be scanned, and a
 * rule the user has already settled is not proposed again.
 */

/** Minimal structured logger (pino-compatible), passed down from `req.log`. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/** What both the list and the extract route return: the scan plus its survivors. */
export interface ConventionsPage {
  /** null before the first scan — that is what drives the page's empty state (D4). */
  scan: ConventionScanDto | null;
  candidates: ConventionCandidate[];
}

/**
 * The edited draft the merge modal posts (D8). `source` is absent on purpose and
 * is not an oversight: it is decided here, as `'extracted'`, exactly as
 * `POST /skills` decides between `manual` and `imported_url` from a checkbox. A
 * client that could name its own source could claim `'manual'` for a body full
 * of verbatim repo text and walk past the trust rule in `run-executor`.
 */
export interface CreateSkillFromConventionsInput {
  name: string;
  description?: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  /** The candidates the body was merged from. Checked, not trusted. */
  convention_ids: string[];
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = container.conventionsRepo;
  }

  /**
   * The page's read. Returns undefined when the repo isn't in this workspace
   * (route → 404) rather than an empty page, so a repo id from another tenant is
   * indistinguishable from one that does not exist.
   */
  async list(workspaceId: string, repoId: string): Promise<ConventionsPage | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    return this.page(workspaceId, repoId);
  }

  /**
   * §3.3 — the extraction pipeline, synchronously (D7): select → call → gate →
   * persist, then answer with the same shape the list route returns so the client
   * needs no second fetch.
   *
   * Runs inline because there is nothing to poll: one model call over ~13 files
   * is seconds, and the design shows a button that says "Scanning…" and comes
   * back with a list. `repo-intel`'s 202-and-poll shape exists because indexing
   * is minutes long and must survive a reload; this is neither.
   */
  async extract(
    workspaceId: string,
    repoId: string,
    logger?: Logger,
  ): Promise<ConventionsPage | undefined> {
    // 1 — resolve the repo, and refuse one with no clone.
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    if (!repo.clonePath) {
      // The seeded `acme/payments-api` has `clonePath: null` and nothing is ever
      // cloned for it, so this is the FIRST thing anyone hits on a fresh
      // install. It is correct behaviour, and the message has to be good enough
      // to read as an explanation rather than a failure.
      throw new ValidationError(
        `${repo.owner}/${repo.name} has no local clone, so there are no files to sample. ` +
          `Conventions are extracted from the clone on disk — add the repository again, or ` +
          `wait for its clone job to finish, and re-run the scan.`,
      );
    }

    // 2 — select and read the sample. Selection is code (D5), not a model call.
    const sampled = await this.sampleFiles(repo);
    if (sampled.length === 0) {
      throw new ValidationError(
        `No files could be read from ${repo.owner}/${repo.name}'s clone. Index the repository ` +
          `first — the sample is its top-ranked source files plus its config files.`,
      );
    }

    // 3 — the workspace's model for this feature, else the registry default (D11).
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);

    // 4 — one structured call. `CONVENTIONS_SCHEMA_NAME` is the only schemaName
    // this module sends; there is no file-selection round trip (D5).
    const messages = await buildExtractionMessages(sampled);
    const result = await llm.completeStructured({
      model,
      schema: ConventionExtraction,
      schemaName: CONVENTIONS_SCHEMA_NAME,
      messages,
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      sessionId: `conventions:${repo.owner}/${repo.name}`,
    });

    // 6 — gate every candidate against the text we actually sent, then drop
    // anything the user has already settled (D3). The map is both the membership
    // test and the content, so grounding against an unsent file is impossible.
    const files = new Map(sampled.map((f) => [f.path, f.content]));
    const settled = await this.repo.listSettled(workspaceId, repoId);
    const seen = new Set(settled.map((row) => dedupeKey(row.rule)));

    const survivors: { rule: string; evidencePath: string; evidenceSnippet: string; confidence: number }[] = [];
    let ungrounded = 0;
    let duplicates = 0;
    for (const raw of result.data.conventions) {
      const grounded = groundCandidate(raw, files);
      if (!grounded) {
        ungrounded += 1;
        continue;
      }
      const key = dedupeKey(grounded.rule);
      if (seen.has(key)) {
        // Either a rule the user accepted or rejected in an earlier scan, or the
        // same rule twice in this response. Both are suppressed by the same set.
        duplicates += 1;
        continue;
      }
      seen.add(key);
      survivors.push({
        rule: grounded.rule,
        evidencePath: grounded.evidence_path,
        evidenceSnippet: grounded.evidence_snippet,
        confidence: grounded.confidence,
      });
    }

    // 7 — one transaction: drop the old pending set, record the scan, insert.
    const { scan, inserted } = await this.repo.replacePending({
      workspaceId,
      repoId,
      sampleCount: sampled.length,
      model,
      candidates: survivors,
    });

    // 8 — say what happened, in the terms the gate makes meaningful.
    logger?.info(
      {
        repoId,
        scanId: scan.id,
        model,
        candidates: inserted.length,
        files: sampled.length,
        ungrounded,
        duplicates,
      },
      `Extracted ${inserted.length} candidates from ${sampled.length} files ` +
        `(${ungrounded} discarded: no evidence)`,
    );

    return this.page(workspaceId, repoId);
  }

  /**
   * Triage one candidate. `status` is the ONLY patchable field: the rule and its
   * evidence are the gate's output, and a hand-edited rule would carry a
   * confidence and a snippet that no longer describe it. Editing happens on the
   * merged body in the modal, which is the design's only editing surface.
   */
  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.setStatus(workspaceId, id, status);
    return row ? toCandidateDto(row) : undefined;
  }

  /**
   * "Accept all" / "Deselect all". Re-reads through `listForRepo` rather than
   * returning the `UPDATE … RETURNING` rows, because the page's order is
   * confidence DESC and an update's returning order is whatever Postgres did.
   */
  async setStatusAll(
    workspaceId: string,
    repoId: string,
    status: BulkStatus,
  ): Promise<ConventionCandidate[] | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    await this.repo.setStatusAll(workspaceId, repoId, status);
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  /**
   * The merge (D8): ONE skill from the accepted set, `source: 'extracted'`,
   * landing as v1 with a single `skill_versions` row — `skillsRepo.insert`
   * already snapshots v1, so there is nothing to reimplement here.
   *
   * The body is the client's EDITED text, not a server-side re-derivation of the
   * draft: the modal is an editor, and re-deriving would silently discard what
   * the user typed. `convention_ids` is therefore not used to build anything —
   * it is checked, so that a skill can only be attributed to candidates this
   * workspace can actually see.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;

    const listed = await this.repo.listForRepo(workspaceId, repoId);
    const known = new Set(listed.map((row) => row.id));
    const unknown = input.convention_ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ValidationError(
        'Every convention_id must be a candidate of this repository that has not been rejected.',
        { convention_ids: unknown },
      );
    }

    const row = await this.container.skillsRepo.insert({
      workspaceId,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      type: input.type,
      source: MERGED_SKILL_SOURCE,
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  // ---- internals -----------------------------------------------------------

  /** The scan + candidate pair both read routes return. */
  private async page(workspaceId: string, repoId: string): Promise<ConventionsPage> {
    const [scan, rows] = await Promise.all([
      this.repo.latestScan(workspaceId, repoId),
      this.repo.listForRepo(workspaceId, repoId),
    ]);
    return { scan: scan ? toScanDto(scan) : null, candidates: rows.map(toCandidateDto) };
  }

  /**
   * §3.3 step 2 — the sample: the fixed config list (D5) followed by repo-intel's
   * top-ranked source files, each read from the clone and each truncated to the
   * per-file budget.
   *
   * A read that fails is skipped SILENTLY and on purpose: most of
   * `CONFIG_FILE_CANDIDATES` is absent in any given repo (a project has one of
   * `eslint.config.js` / `.eslintrc.json` / neither), so "file not there" is the
   * normal case, not an error. An empty body is skipped too — it teaches the
   * model nothing, and `MockGitClient.readFile` answers `''` rather than throwing
   * for a path it has no fixture for.
   */
  private async sampleFiles(repo: RepoBasics): Promise<SampledFile[]> {
    const ranked = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    const ref = { owner: repo.owner, name: repo.name };

    const files: SampledFile[] = [];
    const seen = new Set<string>();
    for (const path of [...CONFIG_FILE_CANDIDATES, ...ranked]) {
      if (seen.has(path)) continue;
      seen.add(path);
      let raw: string;
      try {
        raw = await this.container.git.readFile(ref, path);
      } catch {
        continue;
      }
      if (raw.trim() === '') continue;
      files.push(truncateFile(path, raw));
    }

    return applySampleBudget(files);
  }
}
