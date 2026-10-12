import { MODEL_SLOTS, OPTIONAL_SLOTS, VISION_SLOTS, type AgentBackend, type AiModelKind, type AiPreferences, type MediaPrice, type ModelSlot, type ResolvedAi } from "@studio/shared";

export type ResolveAiInput = {
  /** The user's own choices; null when they never saved any. */
  user: { preferences: AiPreferences; agentBackend: AgentBackend } | null;
  defaults: AiPreferences;
  /** OpenRouter ids of the enabled catalog models, per kind. */
  enabled: Record<AiModelKind, ReadonlySet<string>>;
  /** The enabled agent models that read images: only they may fill a vision slot (`VISION_SLOTS`). */
  vision: ReadonlySet<string>;
  /** Catalog price of the fal models (image, video), by id: the runner estimates and counts the shots with it. */
  prices?: Readonly<Record<string, MediaPrice>>;
};

/** The first candidate still enabled in the catalog: a model the admin turned off falls back to the next level. */
function pick(kind: AiModelKind, enabled: ResolveAiInput["enabled"], ...candidates: (string | undefined)[]) {
  return candidates.find((id) => id !== undefined && enabled[kind].has(id));
}

export class MissingModelError extends Error {
  constructor(readonly slots: ModelSlot[]) {
    super(`Aucun modèle configuré pour : ${slots.join(", ")}. Un administrateur doit choisir les modèles par défaut.`);
  }
}

/**
 * The settings a generation runs with: the user's choice, else the platform default, for every slot. On Claude
 * Code the models stay the runner's own (Claude aliases per step): OpenRouter ids mean nothing there.
 */
export function resolveAi({ user, defaults, enabled, vision, prices: catalog = {} }: ResolveAiInput): ResolvedAi {
  // Claude Code runs on the person's own subscription, through the `claude` command logged in on their machine.
  const backend: AgentBackend = user?.agentBackend === "claude-code" ? "claude-code" : "opencode";
  const own = user?.preferences;
  const media = {
    ttsModel: pick("tts", enabled, own?.media.ttsModel, defaults.media.ttsModel),
    musicModel: pick("music", enabled, own?.media.musicModel, defaults.media.musicModel),
    ttsVoice: own?.media.ttsVoice ?? defaults.media.ttsVoice,
    imageModel: pick("image", enabled, own?.media.imageModel, defaults.media.imageModel),
    videoDraftModel: pick("video", enabled, own?.media.videoDraftModel, defaults.media.videoDraftModel),
    // Without a final model, the final pass keeps the draft's.
    videoFinalModel: pick("video", enabled, own?.media.videoFinalModel, defaults.media.videoFinalModel, own?.media.videoDraftModel, defaults.media.videoDraftModel),
    budgetEur: own?.media.budgetEur ?? defaults.media.budgetEur,
  };
  // A voice belongs to its TTS model: the user's voice only goes with the user's model.
  if (own?.media.ttsModel !== media.ttsModel) media.ttsVoice = defaults.media.ttsVoice;
  const cleanMedia = Object.fromEntries(Object.entries(media).filter(([, value]) => value !== undefined));
  const prices = Object.fromEntries(
    [media.imageModel, media.videoDraftModel, media.videoFinalModel].flatMap((id) => (id && catalog[id] ? [[id, catalog[id]]] : [])),
  );

  if (backend === "claude-code") return { backend, models: {}, media: cleanMedia, prices };

  const models: Record<string, string> = {};
  const missing: ModelSlot[] = [];
  for (const slot of MODEL_SLOTS) {
    // The build's default is the platform's general default: a slot the admin left empty uses it.
    const candidates = [own?.models[slot], defaults.models[slot], defaults.models.build];
    const model = pick("agent", enabled, ...(VISION_SLOTS.includes(slot) ? candidates.filter((id) => id && vision.has(id)) : candidates));
    if (model) models[slot] = model;
    else if (!OPTIONAL_SLOTS.includes(slot)) missing.push(slot);
  }
  if (missing.length > 0) throw new MissingModelError(missing);
  return { backend, models, media: cleanMedia, prices };
}
