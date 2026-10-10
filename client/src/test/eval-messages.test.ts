import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { eval as evalMessages, prReview, agents } from "./messages";

/** Every leaf string of a message tree. */
function leaves(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(leaves);
  return [];
}

describe("eval message files", () => {
  it("the message files hold every string the spec quotes for the eval surfaces, and prReview and agents keep their existing keys", () => {
    // AC-1
    expect(prReview.finding.evalCase.action).toBe("Turn into eval case");
    expect(prReview.finding.evalCase.created).toBe("Eval case created");
    expect(prReview.finding.evalCase.needsDecision).toBe(
      "Accept or dismiss this finding first to turn it into an eval case.",
    );
    // AC-26, AC-73
    const empty =
      "No eval cases yet. Cases are created from accepted or dismissed findings on a pull request.";
    expect(evalMessages.evalsTab.empty).toBe(empty);
    expect(evalMessages.dashboard.empty).toBe(empty);
    // AC-20
    expect(agents.editor.tabs.evals).toBe("Evals");

    expect(evalMessages.deleteCase.title).toBe("Delete eval case {name}?");
    expect(evalMessages.deleteCase.body).toBe("Past runs keep this case's results.");
    expect(evalMessages.agentView.notFound).toBe("This agent does not exist.");
    expect(evalMessages.agentView.trendPlaceholder).toBe(
      "The trend appears after two completed runs.",
    );
    expect(evalMessages.compare.caseSetNotice).toBe(
      "These runs covered different case sets, so their metrics are not directly comparable: {onlyOlder} only in {older}, {onlyNewer} only in {newer}.",
    );

    const all = leaves(evalMessages);
    for (const quoted of [
      "Run all evals",
      "Run eval",
      "Running…",
      "never run",
      "No runs yet",
      "Recent runs",
      "View full dashboard",
      "System prompt unchanged",
      "Last run passed",
      "Last run failed",
      "must not flag",
    ]) {
      expect(all, quoted).toContain(quoted);
    }

    // The delta copy: arrows for up/down, none at zero.
    expect(evalMessages.metrics.delta).toBe("{direction, select, up {▲ {n}pt} down {▼ {n}pt} other {0pt}}");

    // Existing keys survive the additions.
    expect(prReview.finding.accept).toBe("Accept");
    expect(prReview.finding.dismiss).toBe("Reject");
    expect(prReview.finding.cancel).toBe("Cancel");
    expect(prReview.verdict.approve).toBeTypeOf("string");
    expect(prReview.runReview.runAll).toBeTypeOf("string");
    expect(agents.editor.tabs.config).toBe("Config");
    expect(agents.editor.tabs.skills).toBe("Skills");
    expect(agents.editor.tabs.stats).toBe("Stats");
    expect(agents.editor.tabs.ci).toBe("CI");
  });

  it("app/layout.tsx lists eval in USED_NAMESPACES", () => {
    const src = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");
    const list = /const USED_NAMESPACES\s*=\s*\[([\s\S]*?)\]/.exec(src);
    expect(list).not.toBeNull();
    const names = [...list![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toContain("eval");
  });
});
