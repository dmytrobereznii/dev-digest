import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent is given only Read/Grep/Glob here, so it cannot run git or depcruise. The prompt says so
// and tells it the diff is a proposal that may not be applied to the working tree, so it judges the
// diff text itself instead of reading the (unmodified) files and reporting a mismatch.
const prompt = (diffName: string) => `Review this proposed change (scope: the diff below).

The diff is a proposal and is NOT applied to the working tree, so the files on disk will not show
these edits. Judge it from the diff text. You only have Read, Grep and Glob (no git, no make, no
depcruise), so read the rule files you need and skip the mechanical depcruise run. Report only
findings the diff itself introduces, in your usual result format.

${fx(diffName)}`;

export const cases: AgentCase[] = [
  {
    name: "flags both planted server violations in the blast diff and cites a rule for each",
    kind: "quality",
    prompt: prompt("blast-violations.diff"),
    practices: [
      "reports a finding that server/src/modules/blast/service.ts imports or constructs the concrete `OctokitGitHubClient` adapter, i.e. a service depending on a concrete adapter instead of receiving the port",
      "reports a finding that server/src/modules/blast/routes.ts imports or constructs `BlastRepository` directly, bypassing the service",
      // The practice the citation rule in the agent definition exists for: delete that rule and this
      // one drops while the other three hold. Calibrated twice — demanding the exact ripple wording
      // made the judge fail outputs that did cite; accepting any named rule let prose such as
      // "violates the ring 3 rule" pass with the citation rule deleted. The `rule:` slot is the signal.
      "every finding in the findings list carries an explicit `rule:` citation naming its source, such as `rule: onion-architecture → ...`, `rule: frontend-architecture → ...`, `rule: depcruise:<rule-name>` or `rule: principle ...`; a finding that only says in prose that something violates a ring or a rule, without a `rule:` citation, FAILS this practice",
      "the result contains a non-empty verdict line whose value is CONCERNS or BLOCKING, not NO_FINDINGS",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "treats a node:fs import in reviewer-core as a CRITICAL purity breach",
    kind: "quality",
    prompt: prompt("reviewer-core-fs.diff"),
    practices: [
      "reports a finding that reviewer-core/src/review/run.ts now imports `node:fs` (or calls `readFileSync`), as a breach of reviewer-core's no-I/O purity",
      "labels that fs-import finding with severity CRITICAL",
      "the result's verdict value is BLOCKING",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a finding for a pure local-variable rename",
    kind: "quality",
    prompt: prompt("blast-rename.diff"),
    practices: [
      "the result's verdict value is NO_FINDINGS",
      "the result reports no finding labelled CRITICAL or WARNING",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
