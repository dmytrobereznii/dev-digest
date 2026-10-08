import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "./nav";

describe("nav", () => {
  it("WORKSPACE has a Project Context entry that resolves to the active repository", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    const item = workspace?.items.find((i) => i.label === "Project Context");

    expect(item).toBeDefined();
    expect(resolveHref(item!.href, "repo-42")).toBe("/repos/repo-42/context");
  });
});
