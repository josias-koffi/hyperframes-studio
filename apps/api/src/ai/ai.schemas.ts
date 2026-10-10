import { AGENT_BACKENDS, AI_MODEL_KINDS, aiPreferencesSchema } from "@studio/shared";
import { z } from "zod";

const openrouterId = z.string().trim().regex(/^[\w.-]+\/[\w.:~-]+$/, "Identifiant OpenRouter attendu : éditeur/modèle");
const voice = z.string().trim().regex(/^[\w.-]{1,64}$/, "Voix invalide");

export const userAiSettingsSchema = z.object({
  preferences: aiPreferencesSchema,
  agentBackend: z.enum(AGENT_BACKENDS).default("opencode"),
});
export type UserAiSettingsInput = z.infer<typeof userAiSettingsSchema>;

export const createAiModelSchema = z.object({
  openrouterId,
  kind: z.enum(AI_MODEL_KINDS),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  enabled: z.boolean().default(true),
  voices: z.array(voice).max(200).default([]),
  pricing: z.record(z.string(), z.string()).default({}),
  contextLength: z.number().int().positive().nullable().default(null),
});
export type CreateAiModel = z.infer<typeof createAiModelSchema>;

export const updateAiModelSchema = createAiModelSchema.omit({ openrouterId: true, kind: true }).partial();
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
