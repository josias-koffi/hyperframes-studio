import { z } from "zod";

/**
 * Who runs a generation turn. `opencode` calls OpenRouter through the app's proxy; `claude-code` uses the person's
 * own Claude Code subscription, the `claude` command logged in on their machine.
 */
export const AGENT_BACKENDS = ["opencode", "claude-code"] as const;
export type AgentBackend = (typeof AGENT_BACKENDS)[number];

export const AI_MODEL_KINDS = ["agent", "tts", "music"] as const;
export type AiModelKind = (typeof AI_MODEL_KINDS)[number];

/** The backend and model of one job, resolved by the API when it is enqueued. */
export const agentChoiceSchema = z.object({
  backend: z.enum(AGENT_BACKENDS),
  /** OpenRouter id (`vendor/model`) for opencode, a Claude Code alias or id for claude-code. */
  model: z.string().min(1),
});
export type AgentChoice = z.infer<typeof agentChoiceSchema>;

/** Audio models of one job, handed to `scripts/audio.mjs` through `videos/<slug>/.studio.env`. */
export const mediaChoiceSchema = z.object({
  ttsModel: z.string().min(1).optional(),
  ttsVoice: z.string().min(1).optional(),
  musicModel: z.string().min(1).optional(),
});
export type MediaChoice = z.infer<typeof mediaChoiceSchema>;

/**
 * The owner's AI settings resolved by the API when a generation is started (user → platform defaults → runner
 * defaults), carried by every job of that run: the runner queues the next steps itself and knows no user.
 */
export const resolvedAiSchema = z.object({
  backend: z.enum(AGENT_BACKENDS),
  /** Model per slot (`ModelSlot`: a generation step or `edit`). */
  models: z.record(z.string(), z.string().min(1)),
  media: mediaChoiceSchema.default({}),
});
export type ResolvedAi = z.infer<typeof resolvedAiSchema>;
