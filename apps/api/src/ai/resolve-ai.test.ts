import { describe, expect, it } from "vitest";
import { MissingModelError, resolveAi, type ResolveAiInput } from "./resolve-ai";

const enabled: ResolveAiInput["enabled"] = {
  agent: new Set(["anthropic/claude-opus", "openai/gpt-5", "qwen/qwen3-coder"]),
  tts: new Set(["mistralai/voxtral-mini-tts", "openai/tts"]),
  music: new Set(["google/lyria-3-clip-preview"]),
};
const defaults = {
  models: { build: "anthropic/claude-opus", brief: "qwen/qwen3-coder" },
  media: { ttsModel: "mistralai/voxtral-mini-tts", ttsVoice: "fr_marie_neutral", musicModel: "google/lyria-3-clip-preview" },
};
const base: ResolveAiInput = { user: null, defaults, enabled, vision: new Set(["openai/gpt-5"]) };

describe("resolveAi", () => {
  it("uses the platform defaults, the build's for every slot left empty", () => {
    const ai = resolveAi(base);
    expect(ai.backend).toBe("opencode");
    expect(ai.models).toMatchObject({ brief: "qwen/qwen3-coder", storyboard: "anthropic/claude-opus", build: "anthropic/claude-opus", edit: "anthropic/claude-opus" });
    expect(ai.media).toEqual(defaults.media);
  });

  it("puts the user's choices first, unless the admin turned the model off", () => {
    const ai = resolveAi({
      ...base,
      user: { agentBackend: "opencode", preferences: { models: { edit: "openai/gpt-5", build: "retired/model" }, media: {} } },
    });
    expect(ai.models.edit).toBe("openai/gpt-5");
    expect(ai.models.build).toBe("anthropic/claude-opus");
  });

  it("keeps the user's voice only with the user's TTS model", () => {
    const own = (media: Record<string, string>) => resolveAi({ ...base, user: { agentBackend: "opencode", preferences: { models: {}, media } } }).media;
    expect(own({ ttsModel: "openai/tts", ttsVoice: "alloy" })).toMatchObject({ ttsModel: "openai/tts", ttsVoice: "alloy" });
    expect(own({ ttsVoice: "alloy" })).toMatchObject({ ttsModel: "mistralai/voxtral-mini-tts", ttsVoice: "fr_marie_neutral" });
  });

  it("runs Claude Code for whoever chose it, on its subscription, with the runner's own models", () => {
    const user = { agentBackend: "claude-code" as const, preferences: { models: {}, media: {} } };
    expect(resolveAi({ ...base, user })).toMatchObject({ backend: "claude-code", models: {} });
  });

  it("refuses to start when no model can be found for a slot", () => {
    expect(() => resolveAi({ ...base, defaults: { models: {}, media: {} } })).toThrow(MissingModelError);
  });

  it("fills a vision slot only with a model that reads images, and leaves it empty otherwise", () => {
    expect(resolveAi(base).models).not.toHaveProperty("footage");
    expect(resolveAi(base).models).not.toHaveProperty("visual");
    expect(resolveAi(base).models.escalation).toBe("anthropic/claude-opus");
    const user = { agentBackend: "opencode" as const, preferences: { models: { visual: "openai/gpt-5", footage: "qwen/qwen3-coder" }, media: {} } };
    expect(resolveAi({ ...base, user }).models).toMatchObject({ visual: "openai/gpt-5" });
    expect(resolveAi({ ...base, user }).models).not.toHaveProperty("footage");
  });
});
