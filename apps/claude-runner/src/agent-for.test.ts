import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRunnerConfig } from "./config";
import type { StudioEvent } from "@studio/shared";
import type { AgentTurnResult } from "./agents/types";
import { agentFor, escalationAgentFor, verifyBuild } from "./process-job";
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
  it("hands the fal models, their prices and the job's fal token to scripts/shots.mjs, never the fal key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "studio-env-"));
    await writeStudioEnv(
      dir,
      "demo",
      { imageModel: "fal-ai/flux/schnell", videoDraftModel: "fal-ai/ltx", budgetEur: 5 },
      { baseUrl: "http://127.0.0.1:1/api/v1", token: "sk-studio-job", falBaseUrl: "http://127.0.0.1:1/fal" },
      { prices: { "fal-ai/ltx": { unit: "second", usd: 0.08 } }, references: true },
    );
    const env = await readFile(join(dir, "videos", "demo", ".studio.env"), "utf8");
    expect(env).toContain("IMAGE_MODEL=fal-ai/flux/schnell\nVIDEO_DRAFT_MODEL=fal-ai/ltx\nFAL_BASE_URL=http://127.0.0.1:1/fal\nFAL_KEY=sk-studio-job\n");
    expect(env).toContain('FAL_PRICES={"fal-ai/ltx":{"unit":"second","usd":0.08}}\nFAL_REFERENCES=1\n');
  });
});

describe("escalationAgentFor", () => {
  it("takes the owner's escalation slot on OpenCode, Opus on Claude Code, and none when it is the failing model", () => {
    expect(escalationAgentFor({ ...base, step: "build", ai: { ...ai, models: { ...ai.models, escalation: "anthropic/claude-sonnet" } } }, config)).toBe("anthropic/claude-sonnet");
    expect(escalationAgentFor({ ...base, step: "build", ai }, config)).toBeNull();
    expect(escalationAgentFor({ ...base, step: "build", ai: { ...ai, models: { ...ai.models, escalation: "anthropic/claude-opus" } } }, config)).toBeNull();
    expect(escalationAgentFor({ ...base, step: "brief" }, config)).toBe("opus");
  });
});

describe("verifyBuild", () => {
  /** A workspace whose `npm run check` fails `failures` times, then passes. */
  async function workspace(failures: number) {
    const dir = await mkdtemp(join(tmpdir(), "verify-build-"));
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "fails"), String(failures));
    const npm = join(dir, "bin", "npm");
    await writeFile(npm, `#!/bin/sh\nn=$(cat ${dir}/fails)\nif [ "$n" -gt 0 ]; then echo $((n-1)) > ${dir}/fails; echo "✗ gsap_timeline_not_registered"; exit 1; fi\necho ok\n`);
    await chmod(npm, 0o755);
    return { workspaceDir: dir, timeoutMs: 10_000, env: { PATH: `${join(dir, "bin")}:${process.env.PATH}` } };
  }
  const job = { ...base, step: "build" as const, ai };
  const first: AgentTurnResult = { ok: true, sessionId: "ses-1", resultText: "Fait.", costUsd: 0.5 };

  async function run(failures: number, escalationModel: string | null) {
    const { env, ...config } = await workspace(failures);
    const turns: { prompt: string; sessionId: string | null; model: string }[] = [];
    const events: StudioEvent[] = [];
    const verified = await verifyBuild({
      job,
      config,
      env,
      report: { event: async (event) => void events.push(event) },
      turn: async (input) => {
        turns.push(input);
        return { ok: true, sessionId: input.sessionId, resultText: "Corrigé.", costUsd: 0.25 };
      },
      first,
      model: "anthropic/claude-opus",
      escalationModel,
    });
    return { ...verified, turns, events };
  }

  it("passes a build whose check passes, without another turn", async () => {
    const { result, turns, escalation } = await run(0, "x/strong");
    expect(result).toBe(first);
    expect(turns).toEqual([]);
    expect(escalation).toBeUndefined();
  });

  it("sends a failed check back to the session, then to the escalation model, adding up the costs", async () => {
    const { result, turns, escalation } = await run(2, "x/strong");
    expect(turns.map((turn) => [turn.model, turn.sessionId])).toEqual([
      ["anthropic/claude-opus", "ses-1"],
      ["x/strong", "ses-1"],
    ]);
    expect(turns[0].prompt).toContain("gsap_timeline_not_registered");
    expect(result).toMatchObject({ ok: true, costUsd: 1 });
    expect(escalation).toEqual({ model: "x/strong", costUsd: 0.25 });
  });

  it("fails the step after the third failure, or the second without an escalation model", async () => {
    expect((await run(3, "x/strong")).result).toMatchObject({ ok: false, resultText: expect.stringMatching(/échoue toujours/) });
    const alone = await run(2, null);
    expect(alone.turns).toHaveLength(1);
    expect(alone.result.ok).toBe(false);
  });
});
