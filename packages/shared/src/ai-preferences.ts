import { z } from "zod";
import { mediaChoiceSchema } from "./agents";
import { GENERATION_STEPS, type GenerationStep } from "./jobs";

/** A model is chosen per generation step, plus `edit` for the changes asked from the editor. */
export const MODEL_SLOTS = [...GENERATION_STEPS, "edit"] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

/** A model per slot (missing slots fall back to the next level) and the audio models. */
export const aiPreferencesSchema = z.object({
  models: z.partialRecord(z.enum(MODEL_SLOTS), z.string().min(1)).default({}),
  media: mediaChoiceSchema.default({}),
});
export type AiPreferences = z.infer<typeof aiPreferencesSchema>;

/** The slot whose model a job uses: an editor change has its own, a review comment keeps the step's. */
export function modelSlotFor(job: { step: GenerationStep; mode?: "edit" }): ModelSlot {
  return job.mode === "edit" ? "edit" : job.step;
}
