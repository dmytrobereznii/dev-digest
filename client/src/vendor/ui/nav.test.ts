import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "./nav";

describe("nav", () => {
  it("WORKSPACE has a Project Context entry that resolves to the active repository", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    const item = workspace?.items.find((i) => i.label === "Project Context");

    expect(item).toBeDefined();
    expect(resolveHref(item!.href, "repo-42")).toBe("/repos/repo-42/context");
  });

  it("SKILLS LAB has an Eval Dashboard entry after Conventions that opens /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    const labels = lab?.items.map((i) => i.label) ?? [];
    const item = lab?.items.find((i) => i.label === "Eval Dashboard");

    expect(item).toBeDefined();
    expect(labels.indexOf("Eval Dashboard")).toBe(labels.indexOf("Conventions") + 1);
    expect(resolveHref(item!.href, "repo-42")).toBe("/eval");
  });
});
