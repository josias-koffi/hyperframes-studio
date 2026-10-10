import { describe, expect, it } from "vitest";
import { resolveRunnerConfig } from "./config";

describe("resolveRunnerConfig", () => {
  it("runs the recipe steps on Sonnet and the design steps on CLAUDE_MODEL", () => {
    const { stepModels } = resolveRunnerConfig({ CLAUDE_MODEL: "opus", WORKSPACE_DIR: "/ws" });
    expect(stepModels).toEqual({ brief: "sonnet", footage: "opus", variables: "sonnet", storyboard: "opus", media: "sonnet", build: "opus" });
  });

  it("lets CLAUDE_MODEL_<STEP> override a step", () => {
    const { stepModels } = resolveRunnerConfig({ CLAUDE_MODEL_MEDIA: "opus", CLAUDE_MODEL_BUILD: "sonnet", WORKSPACE_DIR: "/ws" });
    expect(stepModels).toEqual({ brief: "sonnet", footage: "opus", variables: "sonnet", storyboard: "opus", media: "opus", build: "sonnet" });
  });

  it("stops an idle OpenCode server after a minute unless OPENCODE_IDLE_MS says otherwise", () => {
    expect(resolveRunnerConfig({ WORKSPACE_DIR: "/ws" }).opencodeIdleMs).toBe(60_000);
    expect(resolveRunnerConfig({ WORKSPACE_DIR: "/ws", OPENCODE_IDLE_MS: "300000" }).opencodeIdleMs).toBe(300_000);
  });

  it("names a model for every step, even without CLAUDE_MODEL: --resume would keep the previous one", () => {
    expect(Object.values(resolveRunnerConfig({ WORKSPACE_DIR: "/ws" }).stepModels)).not.toContain(null);
  });
});
