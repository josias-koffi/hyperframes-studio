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

/** What the model can do: read images, call tools, answer in a given JSON schema, keep no prompt (`zdr`, one of its endpoints). */
export function modelCapabilities(raw: Raw, zdr: ReadonlySet<string> = new Set()): ModelCapability[] {
  const parameters = strings(raw.supported_parameters);
  const capabilities: ModelCapability[] = [];
  if (strings(raw.architecture?.input_modalities).includes("image")) capabilities.push("vision");
  if (parameters.includes("tools")) capabilities.push("tools");
  if (parameters.includes("response_format") || parameters.includes("structured_outputs")) capabilities.push("structured");
  if (typeof raw.id === "string" && zdr.has(raw.id)) capabilities.push("zdr");
  return capabilities;
}

export function toOpenRouterModel(raw: Raw, zdr: ReadonlySet<string> = new Set()): OpenRouterModel | null {
  if (typeof raw.id !== "string") return null;
  const pricing = Object.fromEntries(Object.entries(raw.pricing ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    description: typeof raw.description === "string" ? raw.description : "",
    contextLength: typeof raw.context_length === "number" ? raw.context_length : null,
    pricing,
    kinds: classifyModel(raw),
    capabilities: modelCapabilities(raw, zdr),
    voices: strings(raw.supported_voices),
  };
}

const CACHE_MS = 10 * 60 * 1000;
const defaultBase = () => process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
let cache: { at: number; models: OpenRouterModel[] } | null = null;
let zdrCache: { at: number; models: Set<string> } | null = null;

/** The models with a Zero Data Retention endpoint (`GET /endpoints/zdr`, public), cached ten minutes. */
export async function fetchZdrModels(baseUrl = defaultBase()): Promise<Set<string>> {
  if (zdrCache && Date.now() - zdrCache.at < CACHE_MS) return zdrCache.models;
  const response = await fetch(`${baseUrl}/endpoints/zdr`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OpenRouter /endpoints/zdr: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: { model_id?: unknown }[] };
  const models = new Set((body.data ?? []).flatMap((endpoint) => (typeof endpoint.model_id === "string" ? [endpoint.model_id] : [])));
  zdrCache = { at: Date.now(), models };
  return models;
}

/** OpenRouter's public model list (no key needed), cached ten minutes. */
export async function fetchOpenRouterModels(baseUrl = defaultBase()) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  const [response, zdr] = await Promise.all([fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(15_000) }), fetchZdrModels(baseUrl)]);
  if (!response.ok) throw new Error(`OpenRouter /models: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Raw[] };
  const models = (body.data ?? []).map((raw) => toOpenRouterModel(raw, zdr)).filter((model): model is OpenRouterModel => model !== null);
  cache = { at: Date.now(), models };
  return models;
}
