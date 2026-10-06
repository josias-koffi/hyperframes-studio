import { describe, expect, it } from "vitest";
import { resolveFromRoot, resolveWorkspaceDir } from "./env";

describe("resolveFromRoot", () => {
  it("resolves relative settings against STUDIO_ROOT and keeps absolute ones", () => {
    expect(resolveFromRoot("prompts", { STUDIO_ROOT: "/repo" })).toBe("/repo/prompts");
    expect(resolveFromRoot("/workspace", { STUDIO_ROOT: "/repo" })).toBe("/workspace");
    expect(resolveWorkspaceDir({ STUDIO_ROOT: "/repo" })).toBe("/repo/.workspace");
  });
});
