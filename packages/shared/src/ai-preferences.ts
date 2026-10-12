import { z } from "zod";
import { mediaChoiceSchema } from "./agents";
import { AGENT_STEPS, isShotStep, type GenerationStep } from "./jobs";

/**
 * A model is chosen per generation step run by a model (the shots have their image and video models instead), plus `edit` for the changes asked from the editor, `visual` for the visual
 * check of a build (reads the contact sheet) and `escalation`, the stronger model a step falls back to after two
 * failures.
 */
export const MODEL_SLOTS = [...AGENT_STEPS, "edit", "visual", "escalation"] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

/** Slots whose model reads images: a model without vision cannot be chosen for them. */
export const VISION_SLOTS: readonly ModelSlot[] = ["footage", "visual"];

/**
 * Slots a generation can run without: a vision slot (no vision model, no footage analysis and no visual check) and
 * the escalation (a failure stays a failure).
 */
export const OPTIONAL_SLOTS: readonly ModelSlot[] = ["footage", "visual", "escalation"];

/** A model per slot (missing slots fall back to the next level) and the audio models. */
export const aiPreferencesSchema = z.object({
  models: z.partialRecord(z.enum(MODEL_SLOTS), z.string().min(1)).default({}),
  media: mediaChoiceSchema.default({}),
});
export type AiPreferences = z.infer<typeof aiPreferencesSchema>;

/**
 * The slot whose model a job uses: an editor change has its own, a review comment keeps the step's. A comment on a
 * keyframe or a shot rewrites its prompt in the storyboard: the storyboard's model does it.
 */
export function modelSlotFor(job: { step: GenerationStep; mode?: "edit" }): ModelSlot {
  if (job.mode === "edit") return "edit";
  return isShotStep(job.step) ? "storyboard" : job.step;
}
