import { MODEL_SLOTS, type AgentBackend, type AiModelKind, type AiPreferences, type ModelSlot, type ResolvedAi } from "@studio/shared";

export type ResolveAiInput = {
  role: "admin" | "user";
  /** The user's own choices; null when they never saved any. */
  user: { preferences: AiPreferences; agentBackend: AgentBackend } | null;
  defaults: AiPreferences;
  /** OpenRouter ids of the enabled catalog models, per kind. */
  enabled: Record<AiModelKind, ReadonlySet<string>>;
  claudeCodeEnabled: boolean;
};

/** Claude Code is the server's subscription: only an admin may run on it, and only where it is enabled. */
export function canUseClaudeCode(role: "admin" | "user", claudeCodeEnabled: boolean) {
  return role === "admin" && claudeCodeEnabled;
}

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
export function resolveAi({ role, user, defaults, enabled, claudeCodeEnabled }: ResolveAiInput): ResolvedAi {
  const backend: AgentBackend = user?.agentBackend === "claude-code" && canUseClaudeCode(role, claudeCodeEnabled) ? "claude-code" : "opencode";
  const own = user?.preferences;
  const media = {
    ttsModel: pick("tts", enabled, own?.media.ttsModel, defaults.media.ttsModel),
    musicModel: pick("music", enabled, own?.media.musicModel, defaults.media.musicModel),
    ttsVoice: own?.media.ttsVoice ?? defaults.media.ttsVoice,
  };
  // A voice belongs to its TTS model: the user's voice only goes with the user's model.
  if (own?.media.ttsModel !== media.ttsModel) media.ttsVoice = defaults.media.ttsVoice;
  const cleanMedia = Object.fromEntries(Object.entries(media).filter(([, value]) => value !== undefined));

  if (backend === "claude-code") return { backend, models: {}, media: cleanMedia };

  const models: Record<string, string> = {};
  const missing: ModelSlot[] = [];
  for (const slot of MODEL_SLOTS) {
    // The build's default is the platform's general default: a slot the admin left empty uses it.
    const model = pick("agent", enabled, own?.models[slot], defaults.models[slot], defaults.models.build);
    if (model) models[slot] = model;
    else missing.push(slot);
  }
  if (missing.length > 0) throw new MissingModelError(missing);
  return { backend, models, media: cleanMedia };
}
