import { describe, expect, it } from "vitest";
import { resolveRunnerConfig } from "./config";

describe("resolveRunnerConfig", () => {
  it("stops an idle OpenCode server after a minute unless OPENCODE_IDLE_MS says otherwise", () => {
    expect(resolveRunnerConfig({ WORKSPACE_DIR: "/ws" }).opencodeIdleMs).toBe(60_000);
    expect(resolveRunnerConfig({ WORKSPACE_DIR: "/ws", OPENCODE_IDLE_MS: "300000" }).opencodeIdleMs).toBe(300_000);
  });

  it("chooses no model: every job carries the models of its owner's settings", () => {
    expect(Object.keys(resolveRunnerConfig({ WORKSPACE_DIR: "/ws", CLAUDE_MODEL: "opus" })).filter((key) => /model/i.test(key))).toEqual([]);
  });
});
