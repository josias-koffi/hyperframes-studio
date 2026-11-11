import { AGENT_BACKENDS, AI_MODEL_KINDS, MODEL_CAPABILITIES, aiPreferencesSchema } from "@studio/shared";
import { z } from "zod";

/** An OpenRouter id (`vendor/model`), or a fal endpoint for the image and video models (`fal-ai/kling-video/v3/pro/image-to-video`). */
const PROVIDER_ID = /^[\w.-]+(\/[\w.:~-]+)+$/;
/** What `claude --model` takes: an alias (`sonnet`, `opus[1m]`) or a model id (`claude-opus-5-5`). */
const CLAUDE_ID = /^[\w.-]+(\[[\w.-]+\])?$/;
const openrouterId = z.string().trim().min(1).max(200);
const voice = z.string().trim().regex(/^[\w.-]{1,64}$/, "Voix invalide");

export const userAiSettingsSchema = z.object({
  preferences: aiPreferencesSchema,
  agentBackend: z.enum(AGENT_BACKENDS).default("opencode"),
});
export type UserAiSettingsInput = z.infer<typeof userAiSettingsSchema>;

const aiModelFields = z.object({
  openrouterId,
  kind: z.enum(AI_MODEL_KINDS),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  enabled: z.boolean().default(true),
  voices: z.array(voice).max(200).default([]),
  pricing: z.record(z.string(), z.string()).default({}),
  contextLength: z.number().int().positive().nullable().default(null),
  capabilities: z.array(z.enum(MODEL_CAPABILITIES)).max(MODEL_CAPABILITIES.length).default([]),
});

/** The id's shape depends on who runs the model: OpenRouter and fal name it `vendor/model`, Claude Code by alias or id. */
export const createAiModelSchema = aiModelFields.superRefine((model, ctx) => {
  const claude = model.kind === "claude";
  if (!(claude ? CLAUDE_ID : PROVIDER_ID).test(model.openrouterId)) {
    ctx.addIssue({
      code: "custom",
      path: ["openrouterId"],
      message: claude ? "Identifiant attendu : un alias ou un id de modèle Claude (sonnet, claude-opus-5-5)" : "Identifiant attendu : éditeur/modèle (OpenRouter) ou endpoint fal",
    });
  }
});
export type CreateAiModel = z.infer<typeof createAiModelSchema>;

export const updateAiModelSchema = aiModelFields.omit({ openrouterId: true, kind: true }).partial();
export type UpdateAiModel = z.infer<typeof updateAiModelSchema>;

export const listAiModelsQuerySchema = z.object({ kind: z.enum(AI_MODEL_KINDS).optional() });
export type ListAiModelsQuery = z.infer<typeof listAiModelsQuerySchema>;

export const openRouterSearchSchema = z.object({
  kind: z.enum(AI_MODEL_KINDS).optional(),
  q: z.string().trim().max(100).optional(),
});
export type OpenRouterSearch = z.infer<typeof openRouterSearchSchema>;

export const usageQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });
export type UsageQuery = z.infer<typeof usageQuerySchema>;
