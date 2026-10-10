import { describe, expect, it } from "vitest";
import { classifyModel, toOpenRouterModel } from "./openrouter-catalog";

describe("classifyModel", () => {
  it("offers a text model as an agent only when it calls tools", () => {
    expect(classifyModel({ architecture: { output_modalities: ["text"] }, supported_parameters: ["tools", "temperature"] })).toEqual(["agent"]);
    expect(classifyModel({ architecture: { output_modalities: ["text"] }, supported_parameters: ["temperature"] })).toEqual([]);
  });

  it("tells a voice from a music model by its voices", () => {
    expect(classifyModel({ architecture: { output_modalities: ["text", "audio"] } })).toEqual(["music"]);
    expect(classifyModel({ architecture: { output_modalities: ["audio"] }, supported_voices: ["alloy"] })).toEqual(["tts"]);
  });
});

describe("toOpenRouterModel", () => {
  it("keeps what the import shows and drops what is not a string price", () => {
    expect(
      toOpenRouterModel({
        id: "google/lyria-3-clip-preview",
        name: "Lyria 3 Clip",
        context_length: 1000,
        pricing: { prompt: "0", completion: "0", extra: 3 },
        architecture: { output_modalities: ["text", "audio"] },
      }),
    ).toEqual({
      id: "google/lyria-3-clip-preview",
      name: "Lyria 3 Clip",
      description: "",
      contextLength: 1000,
      pricing: { prompt: "0", completion: "0" },
      kinds: ["music"],
      voices: [],
    });
    expect(toOpenRouterModel({ name: "no id" })).toBeNull();
  });
});
