import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRunnerConfig } from "./config";
import { agentFor } from "./process-job";
import { writeStudioEnv } from "./workspace";

const config = resolveRunnerConfig({ WORKSPACE_DIR: "/ws" });
const base = { jobId: "00000000-0000-4000-8000-000000000001", creationId: "00000000-0000-4000-8000-000000000002", slug: "demo" };
const ai = { backend: "opencode" as const, models: { build: "anthropic/claude-opus", edit: "openai/gpt-5-mini" }, media: {} };

describe("agentFor", () => {
  it("runs a job without settings on Claude Code with the runner's step model", () => {
    expect(agentFor({ ...base, step: "build" }, config)).toEqual({ backend: "claude-code", model: config.stepModels.build });
  });

  it("takes the step's model from the owner's settings, and the edit model for an editor change", () => {
    expect(agentFor({ ...base, step: "build", ai }, config)).toEqual({ backend: "opencode", model: "anthropic/claude-opus" });
    expect(agentFor({ ...base, step: "build", mode: "edit", ai }, config)).toEqual({ backend: "opencode", model: "openai/gpt-5-mini" });
  });

  it("falls back to the runner default when the settings name no model for the step", () => {
    expect(agentFor({ ...base, step: "brief", ai }, config)).toEqual({ backend: "claude-code", model: config.stepModels.brief });
  });
});

describe("writeStudioEnv", () => {
  it("writes only the audio models that are set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "studio-env-"));
    await writeStudioEnv(dir, "demo", { ttsModel: "mistral/voxtral", ttsVoice: "fr_marie_neutral" });
    expect(await readFile(join(dir, "videos", "demo", ".studio.env"), "utf8")).toBe("TTS_MODEL=mistral/voxtral\nTTS_VOICE=fr_marie_neutral\n");
  });
});
