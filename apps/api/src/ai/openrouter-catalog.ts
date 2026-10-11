import type { AiModelKind, ModelCapability } from "@studio/shared";

/** One model of OpenRouter's public list (`GET /api/v1/models`), as the admin import shows it. */
export type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  /** USD per token (or per request/image), as OpenRouter returns them: strings. */
  pricing: Record<string, string>;
  /** What the model can be in the catalog: an agent needs tool calls, music outputs audio. */
  kinds: AiModelKind[];
  capabilities: ModelCapability[];
  voices: string[];
};

type Raw = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  pricing?: Record<string, unknown>;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  supported_parameters?: unknown;
  supported_voices?: unknown;
};

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * The kinds a model may be offered as: an agent must call tools; an audio model with voices speaks, one without
 * is a music candidate (Lyria answers in text + audio too). Most TTS models are not in this list (`/audio/speech`
 * has its own): the admin adds them by hand, with their voices.
 */
export function classifyModel(raw: Raw): AiModelKind[] {
  const output = strings(raw.architecture?.output_modalities);
  const kinds: AiModelKind[] = [];
  if (output.includes("text") && strings(raw.supported_parameters).includes("tools")) kinds.push("agent");
  if (output.includes("audio")) kinds.push(strings(raw.supported_voices).length > 0 ? "tts" : "music");
  return kinds;
}

/** What the model can do: read images, call tools, answer in a given JSON schema. */
export function modelCapabilities(raw: Raw): ModelCapability[] {
  const parameters = strings(raw.supported_parameters);
  const capabilities: ModelCapability[] = [];
  if (strings(raw.architecture?.input_modalities).includes("image")) capabilities.push("vision");
  if (parameters.includes("tools")) capabilities.push("tools");
  if (parameters.includes("response_format") || parameters.includes("structured_outputs")) capabilities.push("structured");
  return capabilities;
}

export function toOpenRouterModel(raw: Raw): OpenRouterModel | null {
  if (typeof raw.id !== "string") return null;
  const pricing = Object.fromEntries(Object.entries(raw.pricing ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    description: typeof raw.description === "string" ? raw.description : "",
    contextLength: typeof raw.context_length === "number" ? raw.context_length : null,
    pricing,
    kinds: classifyModel(raw),
    capabilities: modelCapabilities(raw),
    voices: strings(raw.supported_voices),
  };
}

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; models: OpenRouterModel[] } | null = null;

/** OpenRouter's public model list (no key needed), cached ten minutes. */
export async function fetchOpenRouterModels(baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1") {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OpenRouter /models: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Raw[] };
  const models = (body.data ?? []).map(toOpenRouterModel).filter((model): model is OpenRouterModel => model !== null);
  cache = { at: Date.now(), models };
  return models;
}
