#!/usr/bin/env node
// Per-agent metrics for a Claude Code run, read from the transcripts on disk.
// The parent sees each subagent as one summary line, so this walks every
// agent-*.jsonl under the session instead. No dependencies.
// The transcript fields it relies on are listed in ../references.md.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

const CHECK_RE =
  /\b(make\s+(test|check|typecheck|lint|e2e)[\w-]*|vitest|(pnpm|npm)\s+(run\s+|exec\s+)?(test|typecheck|lint|build)\b|tsc\b|eslint|depcruise)/;
const HANDBACK_TOOL = 'SubagentHandback';
const CHARS_PER_TOKEN = 4;

const USAGE = `usage: report.mjs [session ...] [options]

  session            id, id prefix or path of a session transcript; repeat for a
                     run that spans sessions. Default: the newest session.
  --list             list recent sessions and exit
  --last <n>         use the n newest sessions instead of naming them
  --type <agent>     show only agents of this type, such as implementer
  --since <when>     ignore records before this (ISO time, or 90m / 2h ago)
  --until <when>     ignore records after this
  --timeline         what each session and agent was asked and what it then
                     worked on, in chunks: areas touched, commands, its own words
  --agent <id>       trace one agent: brief, tool calls in order, errors, report
                     (with --timeline: that agent's timeline only)
  --full             with --agent, print the brief and report untruncated
  --json             print the full data as JSON
  --project <dir>    transcript directory (default: derived from the cwd)`;

function fail(message) {
  console.error(`report: ${message}`);
  process.exit(1);
}

function toMs(value, flag) {
  const ago = /^(\d+)([mh])$/.exec(value);
  if (ago) return Date.now() - Number(ago[1]) * (ago[2] === 'h' ? 3600e3 : 60e3);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) fail(`${flag}: cannot read "${value}" as a time`);
  return ms;
}

function parseArgs(argv) {
  const opts = { sessions: [], since: -Infinity, until: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`${arg} needs a value`);
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--session') opts.sessions.push(...value().split(','));
    else if (arg === '--since') opts.since = toMs(value(), arg);
    else if (arg === '--until') opts.until = toMs(value(), arg);
    else if (arg === '--agent') opts.agent = value();
    else if (arg === '--project') opts.project = value();
    else if (arg === '--last') opts.last = Number(value());
    else if (arg === '--type') opts.type = value();
    else if (arg === '--list') opts.list = true;
    else if (arg === '--timeline') opts.timeline = true;
    else if (arg === '--full') opts.full = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('-')) fail(`unknown option ${arg}\n\n${USAGE}`);
    else opts.sessions.push(arg);
  }
  return opts;
}

// Claude Code names a project's transcript folder after its path, with every
// non-alphanumeric character turned into "-".
function findProjectDir(explicit) {
  if (explicit) return resolve(explicit);
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  for (let dir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(root, dir.replace(/[^a-zA-Z0-9]/g, '-'));
    if (existsSync(candidate)) return candidate;
    if (dir === dirname(dir)) fail(`no transcripts under ${root} for ${process.cwd()}`);
  }
}

function sessionFiles(projectDir) {
  return readdirSync(projectDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({ file: join(projectDir, name), mtime: statSync(join(projectDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function resolveSession(projectDir, wanted) {
  if (existsSync(wanted) && statSync(wanted).isFile()) return resolve(wanted);
  const hits = sessionFiles(projectDir).filter((s) => basename(s.file).startsWith(wanted));
  if (hits.length === 1) return hits[0].file;
  fail(hits.length ? `"${wanted}" matches ${hits.length} sessions` : `no session "${wanted}"`);
}

function agentFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return agentFiles(path);
    return /^agent-.*\.jsonl$/.test(entry.name) ? [path] : [];
  });
}

function readJsonl(file) {
  const records = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A session still being written can end on a partial line.
    }
  }
  return records;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => (typeof block === 'string' ? block : (block.text ?? ''))).join('\n');
}

const oneLine = (text, max) => {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

// Paths are shown relative to the repo root, whatever directory the agent was in.
function describeUse(use, root) {
  const input = use.input ?? {};
  const rel = (path) => (path ? relative(root, path) || path : '');
  switch (use.name) {
    case 'Bash':
      return input.command ?? '';
    case 'Read':
      return rel(input.file_path) + (input.offset ? `:${input.offset}` : '');
    case 'Edit':
    case 'Write':
      return rel(input.file_path);
    case 'Grep':
      return `${input.pattern ?? ''} ${rel(input.path)}`;
    case 'Glob':
      return input.pattern ?? '';
    case 'Agent':
    case 'Task':
      return `${input.subagent_type ?? 'general-purpose'}: ${input.description ?? ''}`;
    case 'Skill':
      return input.skill ?? '';
    case 'SendMessage':
      return `to ${input.to ?? '?'}`;
    default:
      return JSON.stringify(input);
  }
}

function parseNotifications(text, into) {
  const blocks = text.match(/<task-notification>[\s\S]*?<\/task-notification>/g) ?? [];
  for (const block of blocks) {
    const tag = (name) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)?.[1];
    const id = tag('task-id');
    if (!id) continue;
    into.set(id, {
      status: tag('status'),
      tokens: Number(tag('subagent_tokens') ?? NaN),
      toolUses: Number(tag('tool_uses') ?? NaN),
      durationMs: Number(tag('duration_ms') ?? NaN),
    });
  }
}

function buildUnit({ file, sessionId, agentId, meta, opts }) {
  const unit = {
    file,
    sessionId,
    agentId,
    type: agentId ? (meta.agentType ?? 'unknown') : 'main',
    description: meta.description ?? meta.name ?? '',
    spawnToolUseId: meta.toolUseId,
    depth: agentId ? (meta.spawnDepth ?? 1) : 0,
    stoppedByUser: Boolean(meta.stoppedByUser),
    root: null,
    requests: new Map(),
    uses: [],
    results: new Map(),
    notifications: new Map(),
    handbacks: new Map(),
    steps: [],
    skillLoads: [],
    brief: null,
    lastText: '',
    humanTurns: 0,
    interrupts: 0,
    humanWaitMs: 0,
    idleWaitMs: 0,
    start: null,
    end: null,
  };
  let lastTextRequest = null;

  for (const record of readJsonl(file)) {
    if (record.type === 'ai-title') unit.title = record.aiTitle;
    if (record.type === 'cost-state') unit.costState = record;
    if (record.type !== 'assistant' && record.type !== 'user') continue;
    const ts = Date.parse(record.timestamp);
    if (Number.isNaN(ts) || ts < opts.since || ts > opts.until) continue;
    unit.root ??= record.cwd ?? null;
    const message = record.message ?? {};

    if (record.type === 'assistant') {
      if (message.model === '<synthetic>') continue;
      // One API response is written as one record per content block, each
      // repeating the same usage, so requests are keyed by message id.
      const key = message.id ?? record.uuid;
      const usage = message.usage ?? {};
      const request = unit.requests.get(key) ?? { ts, model: message.model, in: 0, write: 0, read: 0, out: 0, visible: 0 };
      // A record written at stream start has no stop_reason and a placeholder
      // output count; subagent transcripts are mostly of that kind.
      request.final ||= Boolean(message.stop_reason);
      request.in = Math.max(request.in, usage.input_tokens ?? 0);
      request.write = Math.max(request.write, usage.cache_creation_input_tokens ?? 0);
      request.read = Math.max(request.read, usage.cache_read_input_tokens ?? 0);
      request.out = Math.max(request.out, usage.output_tokens ?? 0);
      unit.requests.set(key, request);
      for (const block of message.content ?? []) {
        if (block.type === 'tool_use' && !unit.uses.some((use) => use.id === block.id)) {
          const use = { id: block.id, name: block.name, input: block.input ?? {}, ts, request: key, cwd: record.cwd };
          unit.uses.push(use);
          unit.steps.push({ ts, use });
          request.visible += JSON.stringify(use.input).length;
        } else if (block.type === 'text') {
          unit.lastText = lastTextRequest === key ? unit.lastText + block.text : block.text;
          lastTextRequest = key;
          unit.steps.push({ ts, say: block.text });
          request.visible += block.text.length;
        }
      }
    } else {
      const content = message.content;
      const isToolResult = Array.isArray(content) && content.every((block) => block.type === 'tool_result');
      if (isToolResult) {
        for (const block of content) {
          const text = textOf(block.content);
          unit.results.set(block.tool_use_id, { chars: text.length, isError: Boolean(block.is_error), text });
        }
      } else {
        const text = textOf(content);
        const origin = record.origin?.kind;
        if (unit.brief === null && !record.isMeta) unit.brief = text;
        const skillDir = /^Base directory for this skill: (.+)/.exec(text)?.[1];
        if (record.isMeta && skillDir) unit.skillLoads.push({ name: basename(skillDir.trim()), chars: text.length, ts });
        if (text.includes('[Request interrupted by user')) unit.interrupts++;
        if (origin === 'task-notification') parseNotifications(text, unit.notifications);
        if (origin === 'peer' && record.origin.from) {
          const body = record.origin.body ?? text;
          unit.handbacks.set(record.origin.from, (unit.handbacks.get(record.origin.from) ?? 0) + body.length);
        }
        // Time spent waiting for a new message is not the agent working.
        if (unit.end !== null) {
          if (origin === 'human') unit.humanWaitMs += ts - unit.end;
          else if (agentId && !record.isMeta) unit.idleWaitMs += ts - unit.end;
        }
        if (origin === 'human') unit.humanTurns++;
        // A new ask: a human prompt in the main session, the brief or a resume in an agent.
        if (origin === 'human' || (agentId && !record.isMeta)) unit.steps.push({ ts, ask: text });
      }
    }
    unit.start ??= ts;
    unit.end = ts;
  }
  return unit;
}

function summarize(unit, root) {
  const requests = [...unit.requests.values()].sort((a, b) => a.ts - b.ts);
  const context = (request) => request.in + request.write + request.read;
  const tokens = { in: 0, write: 0, read: 0, out: 0 };
  for (const request of requests) {
    if (!request.final) request.out = Math.max(request.out, Math.round(request.visible / CHARS_PER_TOKEN));
    for (const key of Object.keys(tokens)) tokens[key] += request[key];
  }
  const models = [...new Set(requests.map((request) => request.model).filter(Boolean))];

  const toolCounts = {};
  const resultChars = {};
  const calls = new Map();
  const checks = { runs: 0, failed: 0, chars: 0 };
  const errors = [];
  for (const use of unit.uses) {
    const result = unit.results.get(use.id);
    use.summary = describeUse(use, root);
    use.chars = result?.chars ?? 0;
    use.isError = result?.isError ?? false;
    toolCounts[use.name] = (toolCounts[use.name] ?? 0) + 1;
    resultChars[use.name] = (resultChars[use.name] ?? 0) + use.chars;
    const signature = `${use.name} ${use.summary}`;
    calls.set(signature, (calls.get(signature) ?? 0) + 1);
    if (use.name === 'Bash' && CHECK_RE.test(use.summary)) {
      checks.runs++;
      checks.chars += use.chars;
      if (use.isError) checks.failed++;
    }
    if (use.isError) errors.push({ tool: use.name, call: oneLine(use.summary, 100), text: oneLine(result.text, 200) });
  }

  const handback = unit.uses.findLast((use) => use.name === HANDBACK_TOOL);
  const report = handback ? textOf(handback.input.message ?? JSON.stringify(handback.input)) : unit.lastText;
  const span = unit.start === null ? 0 : unit.end - unit.start;

  return {
    ...unit,
    requestCount: requests.length,
    tokens,
    outEstimated: requests.some((request) => !request.final),
    changed: [
      ...new Set(
        unit.uses
          .filter((use) => ['Edit', 'Write', 'NotebookEdit'].includes(use.name) && !use.isError)
          .map((use) => use.summary),
      ),
    ],
    models,
    firstContext: requests.length ? context(requests[0]) : 0,
    peakContext: requests.reduce((peak, request) => Math.max(peak, context(request)), 0),
    cacheHit: tokens.read / (tokens.in + tokens.write + tokens.read || 1),
    toolCounts,
    resultChars,
    toolCalls: unit.uses.length,
    repeats: [...calls].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]),
    checks,
    errors,
    denials: errors.filter((error) => /doesn't want to proceed|was denied|hook error/.test(error.text)).length,
    skills: unit.skillLoads.length
      ? unit.skillLoads.map((load) => `${load.name} ${approxTok(load.chars)}`)
      : [...new Set(unit.uses.filter((use) => use.name === 'Skill').map((use) => use.summary))],
    resumes: 0,
    report,
    briefChars: (unit.brief ?? '').length,
    reportChars: report.length,
    activeMs: Math.max(0, span - unit.humanWaitMs - unit.idleWaitMs),
  };
}

function loadRun(projectDir, sessionPaths, opts) {
  const built = [];
  for (const file of sessionPaths) {
    const sessionId = basename(file, '.jsonl');
    built.push(buildUnit({ file, sessionId, agentId: null, meta: {}, opts }));
    for (const agentFile of agentFiles(join(projectDir, sessionId))) {
      const agentId = basename(agentFile, '.jsonl').replace(/^agent-/, '');
      const meta = readJson(agentFile.replace(/\.jsonl$/, '.meta.json'));
      built.push(buildUnit({ file: agentFile, sessionId, agentId, meta, opts }));
    }
  }
  // A session starts in the project root; agents may cd into a package later.
  const root = built.find((unit) => unit.root)?.root ?? process.cwd();
  const units = built.filter((unit) => unit.start !== null).map((unit) => ({ ...summarize(unit, root), root }));
  units.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  // Link each agent to the tool call that spawned it. Agents spawned by the
  // same API response were launched in parallel: one wave.
  const spawns = new Map();
  for (const unit of units) for (const use of unit.uses) spawns.set(use.id, { unit, use });
  const waves = [];
  const seen = { main: 0 };
  for (const unit of units) {
    if (!unit.agentId) {
      unit.label = sessionPaths.length > 1 ? `main:${unit.sessionId.slice(0, 8)}` : 'main';
      continue;
    }
    seen[unit.type] = (seen[unit.type] ?? 0) + 1;
    unit.label = `${unit.type}#${seen[unit.type]}`;
    const spawn = spawns.get(unit.spawnToolUseId);
    const parent = spawn?.unit ?? units.find((other) => !other.agentId && other.sessionId === unit.sessionId);
    unit.parent = parent;
    const waveKey = spawn ? `${parent.file} ${spawn.use.request}` : `${unit.file}`;
    if (!waves.includes(waveKey)) waves.push(waveKey);
    unit.wave = waves.indexOf(waveKey) + 1;
    unit.reported = parent?.notifications.get(unit.agentId);
    unit.handbackChars = parent?.handbacks.get(unit.agentId) ?? unit.reportChars;
  }
  for (const unit of units) {
    for (const use of unit.uses) {
      if (use.name !== 'SendMessage') continue;
      const target = units.find((other) => other.agentId && other.agentId === use.input.to);
      if (target) target.resumes++;
    }
  }
  for (const unit of units) unit.parentLabel = unit.parent?.label;
  return units;
}

function concurrency(agents) {
  const edges = agents.flatMap((unit) => [
    [unit.start, 1],
    [unit.end, -1],
  ]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0;
  let peak = 0;
  let covered = 0;
  let last = null;
  for (const [ts, delta] of edges) {
    if (running > 0) covered += ts - last;
    running += delta;
    peak = Math.max(peak, running);
    last = ts;
  }
  return { peak, coveredMs: covered, summedMs: agents.reduce((sum, unit) => sum + (unit.end - unit.start), 0) };
}

function sharedReads(units) {
  const files = new Map();
  for (const unit of units) {
    for (const use of unit.uses) {
      if (use.name !== 'Read' || !use.input.file_path) continue;
      const path = relative(unit.root, use.input.file_path) || use.input.file_path;
      const readers = files.get(path) ?? new Map();
      const reader = readers.get(unit.label) ?? { reads: 0, chars: 0 };
      reader.reads++;
      reader.chars += use.chars;
      readers.set(unit.label, reader);
      files.set(path, readers);
    }
  }
  return [...files]
    .map(([path, readers]) => ({
      path,
      agents: readers.size,
      reads: [...readers.values()].reduce((sum, reader) => sum + reader.reads, 0),
      chars: [...readers.values()].reduce((sum, reader) => sum + reader.chars, 0),
      readers: [...readers.keys()],
    }))
    .filter((file) => file.agents > 1 || file.reads > 2)
    .sort((a, b) => b.chars - a.chars);
}

const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const approxTok = (chars) => `~${tok(Math.round(chars / CHARS_PER_TOKEN))}`;
const pct = (ratio) => `${Math.round(ratio * 100)}%`;
const clock = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
function dur(ms) {
  const total = Math.round(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(s).padStart(2, '0')}s`;
}

function table(header, rows) {
  if (!rows.length) return '_none_';
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function sumTokens(units) {
  const total = { in: 0, write: 0, read: 0, out: 0 };
  for (const unit of units) for (const key of Object.keys(total)) total[key] += unit.tokens[key];
  return { ...total, estimated: units.some((unit) => unit.outEstimated) };
}

const outCell = (tokens, estimated) => `${estimated ? '~' : ''}${tok(tokens.out)}`;

function report(units, opts) {
  const agents = units.filter((unit) => unit.agentId);
  const mains = units.filter((unit) => !unit.agentId);
  const total = sumTokens(units);
  const runStart = Math.min(...units.map((unit) => unit.start ?? Infinity));
  const runEnd = Math.max(...units.map((unit) => unit.end ?? -Infinity));
  const conc = concurrency(agents);
  const humanWait = mains.reduce((sum, unit) => sum + unit.humanWaitMs, 0);
  const errors = units.reduce((sum, unit) => sum + unit.errors.length, 0);
  const hit = total.read / (total.in + total.write + total.read || 1);
  const costs = mains.filter((unit) => unit.costState);
  const cost = costs.length ? `$${costs.reduce((sum, unit) => sum + unit.costState.totalCostUSD, 0).toFixed(2)}` : 'n/a';
  const windowed = opts.since !== -Infinity || opts.until !== Infinity;
  const out = [];

  out.push('# Run');
  out.push(
    table(
      ['Sessions', 'Window (UTC)', 'Wall', 'Human wait', 'Agents', 'Waves', 'Max parallel', 'Tool errors', 'Cost'],
      [
        [
          mains.map((unit) => unit.sessionId.slice(0, 8)).join(', '),
          `${clock(runStart)} → ${clock(runEnd)}`,
          dur(runEnd - runStart),
          dur(humanWait),
          agents.length,
          new Set(agents.map((unit) => unit.wave)).size,
          conc.peak,
          errors,
          cost,
        ],
      ],
    ),
  );
  if (costs.length !== mains.length || windowed) {
    out.push(
      '\nCost is the last `cost-state` record of each session: it covers the whole session, ignores `--since`/`--until`, and is missing until Claude Code writes one.',
    );
  }
  out.push('\n## Tokens');
  out.push(
    table(
      ['Scope', 'Fresh in', 'Cache write', 'Cache read', 'Out', 'Cache hit'],
      [
        ['main', ...tokenCells(sumTokens(mains))],
        ['subagents', ...tokenCells(sumTokens(agents))],
        ['**total**', ...tokenCells(total)],
      ],
    ),
  );

  out.push('\n## Agents, in start order');
  out.push(
    table(
      ['Agent', 'Id', 'Task', 'Model', 'Wave', 'Start', 'Active', 'Reqs', 'Cache write', 'Cache read', 'Out', 'Hit', 'First ctx', 'Peak ctx', 'Tools', 'Errs', 'Brief → report'],
      units.map((unit) => [
        unit.label,
        unit.agentId ? unit.agentId.slice(0, 8) : unit.sessionId.slice(0, 8),
        oneLine(unit.agentId ? unit.description : (unit.title ?? ''), 44),
        unit.models.map((model) => model.replace(/^claude-/, '')).join(', '),
        unit.agentId ? unit.wave : '',
        `+${dur((unit.start ?? runStart) - runStart)}`,
        dur(unit.activeMs),
        unit.requestCount,
        tok(unit.tokens.write),
        tok(unit.tokens.read),
        outCell(unit.tokens, unit.outEstimated),
        pct(unit.cacheHit),
        tok(unit.firstContext),
        tok(unit.peakContext),
        unit.toolCalls,
        unit.errors.length,
        unit.agentId ? `${approxTok(unit.briefChars)} → ${approxTok(unit.handbackChars)}` : '',
      ]),
    ),
  );
  out.push(
    '\nFirst ctx is the input of the first request: what an agent pays before it does anything (system prompt, CLAUDE.md, tool schemas, brief). Active excludes time waiting for a human or for a resume. An Out marked `~` is estimated from the visible text and tool inputs, because that transcript holds stream-start usage only; it leaves out thinking.',
  );

  if (agents.length) {
    out.push('\n## Concurrency');
    out.push(
      `Subagents ran for ${dur(conc.summedMs)} in total across ${dur(conc.coveredMs)} of wall time: ${(conc.summedMs / (conc.coveredMs || 1)).toFixed(1)}× parallel, peak ${conc.peak} at once.`,
    );
    const reported = agents.filter((unit) => unit.reported && !Number.isNaN(unit.reported.tokens));
    if (reported.length) {
      const said = reported.reduce((sum, unit) => sum + unit.reported.tokens, 0);
      const disk = sumTokens(reported);
      out.push(
        `\nThe completion notices told the parent ${tok(said)} tokens for ${reported.length} agent(s). That figure is each agent's final context size. Across all their requests the same agents processed ${tok(disk.in + disk.write + disk.read)} input tokens (${tok(disk.read)} from cache).`,
      );
    }
    const resumed = agents.filter((unit) => unit.resumes || unit.stoppedByUser);
    if (resumed.length) {
      out.push(
        `\nResumed or stopped: ${resumed.map((unit) => `${unit.label} (${unit.resumes} resume(s)${unit.stoppedByUser ? ', stopped by user' : ''})`).join(', ')}.`,
      );
    }
  }

  out.push('\n## Tool calls and output volume');
  out.push(
    table(
      ['Agent', 'Calls by tool', 'Output by tool (~tokens)', 'Checks run / failed', 'Check output', 'Files changed', 'Skills loaded'],
      units.map((unit) => [
        unit.label,
        topEntries(unit.toolCounts, (n) => n),
        topEntries(unit.resultChars, (chars) => approxTok(chars)),
        unit.checks.runs ? `${unit.checks.runs} / ${unit.checks.failed}` : '',
        unit.checks.runs ? approxTok(unit.checks.chars) : '',
        unit.changed.length || '',
        unit.skills.join(', '),
      ]),
    ),
  );
  out.push('\nChecks are Bash calls that run tests, typecheck, lint or a build. Output volume is counted once, when the result arrives; every later request re-reads it from cache.');

  const biggest = units
    .flatMap((unit) => unit.uses.map((use) => ({ unit, use })))
    .filter(({ use }) => use.name !== HANDBACK_TOOL)
    .sort((a, b) => b.use.chars - a.use.chars)
    .slice(0, 10);
  out.push('\n## Largest tool results');
  out.push(
    table(
      ['Agent', 'Tool', 'Call', 'Size'],
      biggest.map(({ unit, use }) => [unit.label, use.name, `\`${oneLine(use.summary, 90).replace(/\|/g, '\\|')}\``, approxTok(use.chars)]),
    ),
  );

  const shared = sharedReads(units).slice(0, 15);
  out.push('\n## Files read more than once');
  out.push(
    table(
      ['File', 'Agents', 'Reads', 'Size', 'Read by'],
      shared.map((file) => [`\`${file.path}\``, file.agents, file.reads, approxTok(file.chars), oneLine(file.readers.join(', '), 70)]),
    ),
  );

  out.push('\n## Friction');
  const friction = [];
  for (const unit of units) {
    const notes = [];
    if (unit.errors.length) notes.push(`${unit.errors.length} tool error(s), ${unit.denials} of them denials or hook blocks`);
    if (unit.repeats.length) {
      notes.push(`repeated calls: ${unit.repeats.slice(0, 3).map(([call, count]) => `${count}× \`${oneLine(call, 60)}\``).join('; ')}`);
    }
    if (unit.interrupts) notes.push(`${unit.interrupts} interrupt(s)`);
    if (!unit.agentId && unit.humanTurns) notes.push(`${unit.humanTurns} human turn(s)`);
    if (notes.length) friction.push(`- **${unit.label}**: ${notes.join('. ')}.`);
    for (const error of unit.errors.slice(0, 3)) friction.push(`  - \`${error.tool}\` \`${error.call}\` → ${error.text}`);
  }
  out.push(friction.length ? friction.join('\n') : '_none_');

  out.push('\n## Ledger row');
  out.push('Fill the last four cells. Column order is fixed in `.context/retros/ledger.md`.\n');
  out.push(
    `| ${clock(runStart).slice(0, 10)} | <run> | ${mains.map((unit) => unit.sessionId.slice(0, 8)).join('+')} | ${agents.length} | ${conc.peak} | ${dur(mains.reduce((sum, unit) => sum + unit.activeMs, 0))} | ${outCell(total, total.estimated)} | ${tok(total.write)} | ${tok(total.read)} | ${pct(hit)} | ${errors} | ${cost} | <on-task> | <outcome> | <top finding> | <action ids> |`,
  );
  return out.join('\n');
}

const tokenCells = (tokens) => [
  tok(tokens.in),
  tok(tokens.write),
  tok(tokens.read),
  outCell(tokens, tokens.estimated),
  pct(tokens.read / (tokens.in + tokens.write + tokens.read || 1)),
];

const topEntries = (counts, format) =>
  Object.entries(counts)
    .filter(([name, value]) => value > 0 && name !== HANDBACK_TOOL)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => `${name} ${format(value)}`)
    .join(', ');

function trace(unit, opts) {
  const clip = (text, max) => (opts.full || text.length <= max ? text : `${text.slice(0, max)}\n… [${text.length - max} more chars; --full prints all]`);
  const out = [`# ${unit.label} (${unit.agentId ?? unit.sessionId})`, `${unit.description || unit.title || ''}\n`];
  out.push(`Models: ${unit.models.join(', ')} · requests: ${unit.requestCount} · active: ${dur(unit.activeMs)}`);
  out.push(`Tokens: fresh ${tok(unit.tokens.in)}, cache write ${tok(unit.tokens.write)}, cache read ${tok(unit.tokens.read)}, out ${outCell(unit.tokens, unit.outEstimated)}`);
  out.push(`Context: first ${tok(unit.firstContext)}, peak ${tok(unit.peakContext)}`);
  out.push(`Skills loaded: ${unit.skills.join(', ') || 'none'}`);
  out.push(`Files changed: ${unit.changed.join(', ') || 'none'}\n`);
  out.push('## Brief', clip(unit.brief ?? '', 3000), '');
  // Thinking is not stored in transcripts, so the agent's own words between
  // tool calls are the only record of why it took a step.
  out.push('## Steps, in order', 'A quoted line is what the agent said before the calls that follow it.', '');
  for (const step of unit.steps) {
    const at = `+${dur(step.ts - unit.start)}`;
    if (step.say) {
      if (step.say.trim() && step.say !== unit.report) out.push(`${at} > ${oneLine(step.say, opts.full ? 2000 : 300)}`);
    } else if (step.use.name !== HANDBACK_TOOL) {
      const { use } = step;
      out.push(`${at} ${use.isError ? 'ERR ' : ''}${use.name} ${oneLine(use.summary, 110)} → ${approxTok(use.chars)}`);
    }
  }
  out.push('', '## Errors');
  out.push(unit.errors.length ? unit.errors.map((error) => `- \`${error.tool}\` \`${error.call}\` → ${error.text}`).join('\n') : '_none_');
  out.push('', '## Report', clip(unit.report, 6000));
  return out.join('\n');
}

// Directories a call touched, relative to the repo root. Bash commands are
// scanned for path-like words, kept only when they exist on disk.
function areasOf(use, root) {
  const input = use.input ?? {};
  const candidates = [];
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(use.name)) candidates.push(input.file_path);
  else if (use.name === 'Grep' || use.name === 'Glob') candidates.push(input.path);
  else if (use.name === 'Bash') {
    const command = String(input.command ?? '').replace(/\w+:\/\/\S+/g, ' ');
    for (const match of command.matchAll(/(?:^|[\s"'=(])((?:\.{0,2}\/)?[\w.@\-[\]]+(?:\/[\w.@\-[\]]+)+)/g)) {
      const path = resolve(use.cwd ?? root, match[1]);
      if (existsSync(path)) candidates.push(path);
    }
  }
  const areas = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const path = relative(root, resolve(use.cwd ?? root, candidate));
    if (!path || path.startsWith('..')) continue;
    const isFile = /\.[\w]+$/.test(basename(path));
    areas.add(isFile ? dirname(path) : path);
  }
  return [...areas];
}

function shortArea(area) {
  const parts = area.split('/');
  return parts.length > 4 ? `${parts[0]}/…/${parts.slice(-2).join('/')}` : area;
}

function commandHead(command) {
  const words = String(command)
    .replace(/^\s*cd\s+\S+\s*(&&|;)\s*/, '')
    .trim()
    .split(/\s+/)
    .filter((word, index, all) => !(/^\w+=/.test(word) && all.slice(0, index).every((before) => /^\w+=/.test(before))));
  const two = ['make', 'git', 'pnpm', 'npm', 'npx', 'node', 'docker', 'gh'].includes(words[0]);
  return (two ? words.slice(0, words[1] === 'exec' || words[1] === 'run' ? 3 : 2) : words.slice(0, 1)).join(' ');
}

const CHUNK = 25;

function top(counts, limit) {
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');
}

function chunkLines(unit, steps, units) {
  const lines = [];
  const uses = steps.filter((step) => step.use && step.use.name !== HANDBACK_TOOL);
  for (let from = 0; from < uses.length; from += CHUNK) {
    const slice = uses.slice(from, from + CHUNK);
    const [first, last] = [slice[0], slice.at(-1)];
    const tools = new Map();
    const areas = new Map();
    const ran = new Map();
    let errors = 0;
    for (const { use } of slice) {
      tools.set(use.name, (tools.get(use.name) ?? 0) + 1);
      for (const area of areasOf(use, unit.root)) areas.set(shortArea(area), (areas.get(shortArea(area)) ?? 0) + 1);
      if (use.name === 'Bash') ran.set(commandHead(use.input.command), (ran.get(commandHead(use.input.command)) ?? 0) + 1);
      if (use.isError) errors++;
    }
    const span = `+${dur(first.ts - unit.start)} → +${dur(last.ts - unit.start)}`;
    lines.push(`- **calls ${from + 1}–${from + slice.length}** (${span}): ${top(tools, 4)}${errors ? ` · ${errors} error(s)` : ''}`);
    if (areas.size) lines.push(`  - where: ${top(areas, 5)}`);
    if (ran.size) lines.push(`  - ran: ${top(ran, 5)}`);
    const spawned = slice
      .filter(({ use }) => use.name === 'Agent' || use.name === 'Task')
      .map(({ use }) => units.find((other) => other.spawnToolUseId === use.id)?.label ?? use.summary);
    if (spawned.length) lines.push(`  - spawned: ${spawned.join(', ')}`);
    const said = steps.filter((step) => step.say?.trim() && step.ts >= first.ts && step.ts <= last.ts && step.say !== unit.report);
    for (const step of said.slice(0, 4)) lines.push(`  - said: "${oneLine(step.say, 220)}"`);
    if (said.length > 4) lines.push(`  - … and ${said.length - 4} more remark(s)`);
  }
  return lines;
}

function timeline(units, opts) {
  const out = ['# Timeline', 'Each ask, then what was worked on after it. "where" counts calls per directory.'];
  for (const unit of units) {
    out.push('', `## ${unit.label} (${(unit.agentId ?? unit.sessionId).slice(0, 8)}): ${oneLine(unit.description || unit.title || '', 80)}`);
    const requests = [...unit.requests.values()];
    const totalInput = requests.reduce((sum, request) => sum + request.in + request.write + request.read, 0) || 1;
    const asks = unit.steps.filter((step) => step.ask !== undefined);
    const bounds = asks.length ? asks : [{ ts: unit.start, ask: unit.brief ?? '' }];
    bounds.forEach((ask, index) => {
      const until = bounds[index + 1]?.ts ?? Infinity;
      const steps = unit.steps.filter((step) => step.ts >= ask.ts && step.ts < until);
      const mine = requests.filter((request) => request.ts >= ask.ts && request.ts < until);
      const input = mine.reduce((sum, request) => sum + request.in + request.write + request.read, 0);
      const calls = steps.filter((step) => step.use).length;
      out.push(
        '',
        `### ${unit.agentId ? (index ? `Resume ${index}` : 'Brief') : `Turn ${index + 1}`} · +${dur(ask.ts - unit.start)} · ${calls} calls, ${mine.length} requests · ${pct(input / totalInput)} of its input`,
        `Asked: ${oneLine(ask.ask, opts.full ? 4000 : 500)}`,
        ...chunkLines(unit, steps, units),
      );
    });
    if (unit.agentId && unit.report) out.push('', `Reported: ${oneLine(unit.report, opts.full ? 4000 : 500)}`);
  }
  return out.join('\n');
}

function list(projectDir) {
  const rows = sessionFiles(projectDir)
    .slice(0, 20)
    .map(({ file, mtime }) => {
      const id = basename(file, '.jsonl');
      const titles = readJsonl(file).filter((record) => record.type === 'ai-title');
      const types = {};
      for (const agentFile of agentFiles(join(projectDir, id))) {
        const type = readJson(agentFile.replace(/\.jsonl$/, '.meta.json')).agentType ?? 'unknown';
        types[type] = (types[type] ?? 0) + 1;
      }
      const agents = Object.entries(types).map(([type, count]) => `${count} ${type}`);
      return [id, clock(mtime), oneLine(titles.at(-1)?.aiTitle ?? '', 50), agents.join(', ')];
    });
  return table(['Session', 'Last write (UTC)', 'Title', 'Subagents'], rows);
}

function serializable(unit) {
  const { requests, results, notifications, handbacks, parent, uses, steps, brief, lastText, report: text, costState, ...rest } = unit;
  return { ...rest, costUSD: costState?.totalCostUSD, uses: uses.map(({ input, ...use }) => use) };
}

const opts = parseArgs(process.argv.slice(2));
const projectDir = findProjectDir(opts.project);
if (opts.list) {
  console.log(list(projectDir));
  process.exit(0);
}
const sessions = sessionFiles(projectDir);
if (!sessions.length) fail(`no sessions in ${projectDir}`);
const paths = opts.sessions.length
  ? opts.sessions.map((wanted) => resolveSession(projectDir, wanted))
  : sessions.slice(0, opts.last ?? 1).map((session) => session.file);
const units = loadRun(projectDir, [...new Set(paths)], opts).filter(
  (unit) => unit.start !== null && (!opts.type || !unit.agentId || unit.type === opts.type),
);
if (!units.length) fail('no records in that window');

const picked = opts.agent
  ? units.find((candidate) => (candidate.agentId ?? candidate.sessionId).startsWith(opts.agent) || candidate.label === opts.agent)
  : null;
if (opts.agent && !picked) fail(`no agent "${opts.agent}" in this run`);

if (opts.timeline) {
  console.log(timeline(picked ? [picked] : units, opts));
} else if (picked) {
  console.log(trace(picked, opts));
} else if (opts.json) {
  console.log(JSON.stringify({ units: units.map(serializable), sharedReads: sharedReads(units) }, null, 2));
} else {
  console.log(report(units, opts));
}
