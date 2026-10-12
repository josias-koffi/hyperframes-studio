import { z } from "zod";

/**
 * Who runs a generation turn. `opencode` calls OpenRouter through the app's proxy; `claude-code` uses the person's
 * own Claude Code subscription, the `claude` command logged in on their machine.
 */
export const AGENT_BACKENDS = ["opencode", "claude-code"] as const;
export type AgentBackend = (typeof AGENT_BACKENDS)[number];

/**
 * `agent`, `tts` and `music` are OpenRouter models; `image` and `video` are fal endpoints (`fal-ai/…`), which generate
 * the keyframes and the shots of a realistic création, priced in the catalog (`MEDIA_PRICE_KEYS`).
 */
export const AI_MODEL_KINDS = ["agent", "tts", "music", "image", "video"] as const;
export type AiModelKind = (typeof AI_MODEL_KINDS)[number];

/** The fal kinds: their id is a fal endpoint, their price is set by the admin (fal's catalog is not OpenRouter's). */
export const FAL_MODEL_KINDS: readonly AiModelKind[] = ["image", "video"];

/** Where a fal model's price sits in `ai_models.pricing` (USD, as a string): per image, per second of video. */
export const MEDIA_PRICE_KEYS = { image: "perImage", video: "perSecond", videoWithAudio: "perSecondAudio" } as const;

/**
 * What a model can do, read from OpenRouter when it is imported (`architecture.input_modalities`,
 * `supported_parameters`): `vision` reads images, `tools` calls tools (an agent), `structured` answers in a given
 * JSON schema (`response_format` or `structured_outputs`).
 */
export const MODEL_CAPABILITIES = ["vision", "tools", "structured"] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

/** The backend and model of one job, resolved by the API when it is enqueued. */
export const agentChoiceSchema = z.object({
  backend: z.enum(AGENT_BACKENDS),
  /** OpenRouter id (`vendor/model`) for opencode, a Claude Code alias or id for claude-code. */
  model: z.string().min(1),
});
export type AgentChoice = z.infer<typeof agentChoiceSchema>;

/**
 * Media models of one job, handed to `scripts/audio.mjs` and `scripts/shots.mjs` through `videos/<slug>/.studio.env`:
 * the audio, and for a realistic création the keyframes' image model, the video models of the draft and of the
 * final pass, and what its shots may cost before the studio asks (euros).
 */
export const mediaChoiceSchema = z.object({
  ttsModel: z.string().min(1).optional(),
  ttsVoice: z.string().min(1).optional(),
  musicModel: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
  videoDraftModel: z.string().min(1).optional(),
  videoFinalModel: z.string().min(1).optional(),
  budgetEur: z.number().positive().max(1000).optional(),
});
export type MediaChoice = z.infer<typeof mediaChoiceSchema>;

export const mediaPriceSchema = z.object({
  unit: z.enum(["image", "second"]),
  usd: z.number().nonnegative(),
  /** A video model that charges more when it generates the sound (Veo): the price per second with sound. */
  usdWithAudio: z.number().nonnegative().optional(),
});
export type MediaPrice = z.infer<typeof mediaPriceSchema>;

/** A fal model's price from its catalog row (`pricing`, USD as strings); null when the admin set none. */
export function mediaPriceOf(kind: AiModelKind, pricing: Readonly<Record<string, string>>): MediaPrice | null {
  const read = (key: string) => {
    const value = Number.parseFloat(pricing[key] ?? "");
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  if (kind === "image") {
    const usd = read(MEDIA_PRICE_KEYS.image);
    return usd === undefined ? null : { unit: "image", usd };
  }
  if (kind === "video") {
    const usd = read(MEDIA_PRICE_KEYS.video);
    const usdWithAudio = read(MEDIA_PRICE_KEYS.videoWithAudio);
    return usd === undefined ? null : { unit: "second", usd, ...(usdWithAudio !== undefined ? { usdWithAudio } : {}) };
  }
  return null;
}

/**
 * The owner's AI settings resolved by the API when a generation is started (user → platform defaults → runner
 * defaults), carried by every job of that run: the runner queues the next steps itself and knows no user.
 */
export const resolvedAiSchema = z.object({
  backend: z.enum(AGENT_BACKENDS),
  /** Model per slot (`ModelSlot`: a generation step or `edit`). */
  models: z.record(z.string(), z.string().min(1)),
  media: mediaChoiceSchema.default({}),
  /** Catalog price of the job's fal models (USD per image or per second), to estimate and count what shots cost. */
  prices: z.record(z.string(), mediaPriceSchema).default({}),
});
export type ResolvedAi = z.infer<typeof resolvedAiSchema>;
